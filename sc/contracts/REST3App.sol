// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import "./BusinessTypes.sol";
import {StakeLib} from "./StakeLib.sol";

import "hardhat/console.sol";

contract REST3App {
    using EnumerableSet for EnumerableSet.AddressSet;
    using StakeLib for StakeLib.Stake;

    GlobalParams public globalParams;
    uint public treasury;
    uint public totalContributions;
    StakeLib.Stake private _stake; // publicly exposed via getStakeRequirement()

    mapping(address => Server) private _servers;
    EnumerableSet.AddressSet private _serverSet;

    RequestQueue private _requestQueue;

    Batch private _batch;
    uint _batchNonceGenerator;
    mapping(uint => BatchRange) _batchRanges;
    mapping(bytes32 => BatchResult) private _batchResults;
    mapping(uint => Consensus) private _consensus;
    mapping(uint => Response) private _responseByNonce;

    modifier onlyRegistered() {
        if (!_serverSet.contains(msg.sender)) {
            revert ServerNotRegistered();
        }
        _;
    }

    event ServerRegistered(address indexed addr);
    event ServerUnregistered(address indexed addr);
    event NextBatchReady();
    event ResponseReceived(uint indexed nonce);
    event RequestFailed(uint indexed nonce);
    event BatchResultRecorded();
    event RequestSubmitted(uint indexed nonce);
    event BatchSkipped();
    event NoActionTaken();
    event BatchResultIgnored();
    event ConsensusExpired();
    event HousekeepSuccess(uint nextHousekeepTimestamp);

    error BatchSizeMismatch(uint expectedSize);
    error EmptyBatch();
    error ServerAlreadyRegistered();
    error ServerNotRegistered();
    error InsufficientStake();
    error InvalidBatchNonce();
    error ResultAlreadySubmitted();
    error ResponseNotAvailable();
    error RequestAuthorMismatch();
    error HousekeepCooldown(uint nextHousekeepTimestamp);

    constructor(
        GlobalParams memory globalParams_,
        string memory stateIpfsHash
    ) {
        globalParams = globalParams_;
        _stake.minAmount = globalParams.minStake;
        _batch.initialStateIpfsHash = stateIpfsHash;
        _requestQueue.head = 1;
        _requestQueue.tail = 1;
        _batch.head = 1;
    }

    receive() external payable {
        donateToTreasury();
    }

    /**
     * This function may be called by anyone who wants to add funds to treasury.
     */
    function donateToTreasury() public payable {
        treasury += msg.value;
    }

    /**
     * Get the minimum amount to stake in order to register now as a server.
     */
    function getStakeRequirement() external view returns (uint) {
        return _stake.calculateAmount();
    }

    /**
     * Get the number of servers currently registered
     */
    function getServerCount() external view returns (uint) {
        return _serverSet.length();
    }

    /**
     * Register as a server. Requires to send a value that is greater than or
     * equal to the minimum stake requirement accessible via getStakeRequirement().
     */
    function serverRegister() external payable {
        Server storage s = _servers[msg.sender];
        if (s.addr == msg.sender) {
            revert ServerAlreadyRegistered();
        }
        if (!_stake.tryStake()) {
            revert InsufficientStake();
        }
        s.addr = msg.sender;
        s.stake = msg.value;
        s.lastSeen = block.timestamp;
        _serverSet.add(msg.sender);
        _setNextHousekeepTimestamp(s);
        emit ServerRegistered(msg.sender);
    }

    /**
     * Unregister a server. Contribution points are forfeited if no withdrawal is
     * made beforehand. Unregistering costs a fee of a certain % of staked amount
     * defined in global params.
     */
    function serverUnregister() external onlyRegistered {
        _slash(msg.sender);
        _unregister(msg.sender);
    }

    /**
     * Calculate the rewards that can be claimed from the server's contributions.
     */
    function getClaimableRewards() external view onlyRegistered returns (uint) {
        Server storage s = _servers[msg.sender];
        return _calculateTreasuryShare(s);
    }

    /**
     * Claim rewards corresponding to a share of the treasury calculated from
     * contribution points.
     */
    function claimRewards() external onlyRegistered {
        Server storage s = _servers[msg.sender];
        uint rewards = _calculateTreasuryShare(s);
        payable(msg.sender).transfer(rewards);
        treasury -= rewards;
        _resetContributionPoints(s);
    }

    /**
     * Get all data from the current batch.
     */
    function getCurrentBatch()
        external
        view
        onlyRegistered
        returns (BatchView memory)
    {
        uint batchSize = _batchSize();
        if (batchSize == 0) {
            revert EmptyBatch();
        }
        uint startedAt = _consensus[_batch.nonce].startedAt;
        BatchView memory batchView = BatchView({
            nonce: _batch.nonce,
            initialStateIpfsHash: _batch.initialStateIpfsHash,
            requests: new Request[](batchSize),
            expiresAt: startedAt + globalParams.consensusMaxDuration
        });
        for (uint i = 0; i < batchSize; i++) {
            batchView.requests[i] = _requestQueue.queue[_batch.head + i];
        }
        return batchView;
    }

    /**
     * Submit the result for a specific batch. Result is taken into account if and only if:
     * - Current batch nonce matches with the one provided in the response
     * - Current batch is not empty
     * - Number of responses matches number of requests in batch
     * - Result has not already been submitted for the same batch
     * - Consensus period hasn't ended
     *
     * If this submission completes the consensus step, participants in majority receive a
     * contribution point, participants in minority get a part of their stake slashed.
     */
    function submitBatchResult(
        BatchResult calldata result
    ) external onlyRegistered {
        if (result.nonce + 1 == _batch.nonce) {
            emit BatchResultIgnored();
            return;
        }
        if (result.nonce != _batch.nonce) {
            revert InvalidBatchNonce();
        }
        uint batchSize = _batchSize();
        if (batchSize == 0) {
            revert EmptyBatch();
        }
        if (result.responses.length != batchSize) {
            revert BatchSizeMismatch(batchSize);
        }
        Consensus storage consensus = _consensus[_batch.nonce];
        if (consensus.resultsByServer[msg.sender] != bytes32(0)) {
            revert ResultAlreadySubmitted();
        }
        if (_isConsensusExpired(consensus)) {
            emit ConsensusExpired();
            return;
        }
        bytes32 resultHash = keccak256(abi.encode(result));
        _batchResults[resultHash] = result;
        _addResultToConsensus(consensus, resultHash);
        _servers[msg.sender].lastSeen = block.timestamp;
        emit BatchResultRecorded();
    }

    /**
     * Servers are expected to call this function when the consensus of the current batch
     * has expired. This is so the protocol doesn't get stuck if nobody is submitting
     * responses after batch expiration. One that successfully skips a batch via this function
     * receives a contribution point.
     */
    function skipBatchIfConsensusExpired() external onlyRegistered {
        Consensus storage consensus = _consensus[_batch.nonce];
        if (_isConsensusExpired(consensus)) {
            _handleConsensusFailure();
            _prepareNextBatch();
            _giveContributionPoints(_servers[msg.sender], 1);
            emit BatchSkipped();
        } else {
            emit NoActionTaken();
        }
    }

    /**
     * Get the timestamp after which the server is able to call housekeepInactive() again.
     */
    function getNextHousekeepTimestamp()
        external
        view
        onlyRegistered
        returns (uint)
    {
        return _servers[msg.sender].nextHousekeepAt;
    }

    /**
     * Clean up inactive servers at regular intervals. A single server may
     * call this function once in a while, cooldown gets higher as more servers
     * join the protocol. Each call give contribution points on success.
     */
    function housekeepInactive() external onlyRegistered {
        Server storage server = _servers[msg.sender];
        if (block.timestamp < server.nextHousekeepAt) {
            revert HousekeepCooldown(server.nextHousekeepAt);
        }
        address[] memory inactiveServers = new address[](
            _serverSet.length() - 1 // - 1 because msg.sender cannot be in this array
        );
        uint inactiveIndex = 0;
        for (uint i = 0; i < _serverSet.length(); i++) {
            address addr = _serverSet.at(i);
            if (addr == msg.sender) continue;
            uint elapsedSeen = block.timestamp - _servers[addr].lastSeen;
            if (elapsedSeen > globalParams.inactivityDuration) {
                // Inactive for more than inactivityDuration = unregister
                inactiveServers[inactiveIndex++] = addr;
            }
        }
        for (uint i = 0; i < inactiveIndex; i++) {
            _slash(inactiveServers[i]);
            _unregister(inactiveServers[i]);
        }
        _giveContributionPoints(server, globalParams.housekeepReward);
        _setNextHousekeepTimestamp(server);
        emit HousekeepSuccess(server.nextHousekeepAt);
    }

    /**
     * Get all data related to contribution statistics of the server calling this function.
     */
    function getContributionData()
        external
        view
        onlyRegistered
        returns (Server memory)
    {
        return _servers[msg.sender];
    }

    /**
     * Clients may send requests through this function. If current batch is empty,
     * it is loaded immediately in a batch, otherwise it is enqueued and will be
     * processed in next batch.
     */
    function sendRequest(string calldata requestIpfsHash) external {
        uint nonce = _queueRequest(requestIpfsHash);
        emit RequestSubmitted(nonce);
        if (_batchSize() == 0) {
            _prepareNextBatch();
        }
    }

    /**
     * Clients may read the response for their request here. They are expected
     * to listen to ResponseReceived events matching their request nonce and
     * then call this function.
     */
    function getResponse(uint nonce) external view returns (Response memory) {
        Response memory r = _responseByNonce[nonce];
        if (r.requestNonce == 0) {
            revert ResponseNotAvailable();
        }
        if (r.author != msg.sender) {
            revert RequestAuthorMismatch();
        }
        return r;
    }

    // --------------
    // Internals
    // --------------

    function _batchSize() internal view returns (uint) {
        return _requestQueue.head - _batch.head;
    }

    function _queueRequest(
        string calldata requestIpfsHash
    ) internal returns (uint) {
        uint tail = _requestQueue.tail++;
        Request storage req = _requestQueue.queue[tail];
        req.nonce = tail;
        req.ipfsHash = requestIpfsHash;
        req.author = msg.sender;
        return tail;
    }

    function _prepareNextBatch() internal {
        uint oldHead = _requestQueue.head;
        uint newHead = Math.min(oldHead + BATCH_SIZE, _requestQueue.tail);
        _batch.head = oldHead;
        _requestQueue.head = newHead;
        if (newHead - oldHead > 0) {
            uint nonce = _batchNonceGenerator++;
            _batch.nonce = nonce;
            _batchRanges[nonce].start = oldHead;
            _batchRanges[nonce].end = newHead;
            _consensus[_batch.nonce].startedAt = block.timestamp;
            emit NextBatchReady();
        }
    }

    function _addResultToConsensus(
        Consensus storage consensus,
        bytes32 resultHash
    ) internal {
        consensus.resultsByServer[msg.sender] = resultHash;
        consensus.serversWhoParticipated.push(msg.sender);
        uint count = ++consensus.countByResult[resultHash];
        if (count > consensus.countByResult[consensus.resultWithLargestCount]) {
            consensus.resultWithLargestCount = resultHash;
        }
        if (
            (consensus.serversWhoParticipated.length * 100) /
                _serverSet.length() >=
            globalParams.consensusQuorumPercent
        ) {
            if (
                (consensus.countByResult[consensus.resultWithLargestCount] *
                    100) /
                    consensus.serversWhoParticipated.length >=
                globalParams.consensusRatioPercent
            ) {
                _handleConsensusSuccess(consensus);
            } else {
                _handleConsensusFailure();
            }
            _prepareNextBatch();
        }
    }

    function _handleConsensusSuccess(Consensus storage consensus) internal {
        bytes32 resultHash = consensus.resultWithLargestCount;
        BatchResult storage batchResult = _batchResults[resultHash];
        _batch.initialStateIpfsHash = batchResult.finalStateIpfsHash;
        uint rangeStart = _batchRanges[batchResult.nonce].start;
        uint rangeEnd = _batchRanges[batchResult.nonce].end;
        for (uint i = 0; i < rangeEnd - rangeStart; i++) {
            Response memory r = batchResult.responses[i];
            uint nonce = rangeStart + i;
            _responseByNonce[i] = r;
            emit ResponseReceived(nonce);
        }
        for (uint i = 0; i < consensus.serversWhoParticipated.length; i++) {
            address addr = consensus.serversWhoParticipated[i];
            bytes32 resultOfServer = consensus.resultsByServer[addr];
            if (resultOfServer == resultHash) {
                // Server in majority = give a contribution point
                _giveContributionPoints(_servers[addr], 1);
            } else {
                // Server in minority = slash stake
                _slash(addr);
                if (_servers[addr].stake < globalParams.minStake) {
                    _unregister(addr);
                }
            }
        }
    }

    function _handleConsensusFailure() internal {
        for (uint h = _batch.head; h < _requestQueue.head; h++) {
            Request storage r = _requestQueue.queue[h];
            emit RequestFailed(r.nonce);
        }
    }

    function _isConsensusExpired(
        Consensus storage consensus
    ) internal view returns (bool) {
        return
            block.timestamp - consensus.startedAt >
            globalParams.consensusMaxDuration;
    }

    function _setNextHousekeepTimestamp(Server storage s) internal {
        s.nextHousekeepAt =
            block.timestamp +
            globalParams.inactivityDuration *
            _serverSet.length();
    }

    function _giveContributionPoints(
        Server storage server,
        uint points
    ) internal {
        server.contributions += points;
        totalContributions += points;
    }

    function _resetContributionPoints(Server storage server) internal {
        totalContributions -= server.contributions;
        server.contributions = 0;
    }

    function _calculateTreasuryShare(
        Server storage s
    ) internal view returns (uint) {
        if (totalContributions == 0) {
            return 0;
        }
        return (treasury * s.contributions) / totalContributions;
    }

    function _slash(address addr) internal {
        uint stake = _servers[addr].stake;
        uint toSlash = (stake * globalParams.slashPercent) / 100;
        stake -= toSlash;
        _servers[addr].stake = stake;
        treasury += toSlash;
    }

    function _unregister(address addr) internal {
        Server storage s = _servers[addr];
        payable(addr).transfer(s.stake);
        _serverSet.remove(addr);
        _resetContributionPoints(s);
        delete _servers[addr];
        emit ServerUnregistered(addr);
    }

    function _printHeads() internal view {
        console.log(
            "batch head = %d ; queue head = %d ; queue tail = %d",
            _batch.head,
            _requestQueue.head,
            _requestQueue.tail
        );
    }
}
