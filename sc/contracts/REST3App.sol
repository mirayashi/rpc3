// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import "./BusinessTypes.sol";
import {StakeLib} from "./StakeLib.sol";

contract REST3App {
    using EnumerableSet for EnumerableSet.AddressSet;
    using StakeLib for StakeLib.Stake;

    GlobalParams public _globalParams;
    uint public _treasury;
    uint public _totalContributions;
    StakeLib.Stake private _stake; // publicly exposed via getStakeAmount()

    mapping(address => Server) private _servers;
    EnumerableSet.AddressSet private _serverSet;

    RequestQueue private _requestQueue;

    Batch private _batch;
    uint private _batchActualSize;
    uint _batchNonceGenerator;
    mapping(bytes32 => BatchResult) private _batchResults;
    mapping(uint => Consensus) private _consensus;
    mapping(uint => Response) private _responseByNonce;

    modifier onlyRegistered() {
        if (!_serverSet.contains(msg.sender)) {
            revert ServerNotRegistered();
        }
        _;
    }

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

    error EmptyBatch();
    error ServerAlreadyRegistered();
    error ServerNotRegistered();
    error InsufficientStake();
    error InvalidBatchNonce();
    error ResultAlreadySubmitted();
    error ResponseNotAvailable();
    error RequestAuthorMismatch();
    error HousekeepCooldown(uint nextHousekeepTimestamp);

    constructor(GlobalParams memory globalParams, string memory stateIpfsHash) {
        _globalParams = globalParams;
        _stake.minAmount = globalParams.minStake;
        _batch.initialStateIpfsHash = stateIpfsHash;
        _requestQueue.head = 1;
        _requestQueue.tail = 1;
    }

    fallback() external {
        donateToTreasury();
    }

    /**
     * This function may be called by anyone who wants to add funds to treasury.
     */
    function donateToTreasury() public payable {
        _treasury += msg.value;
    }

    /**
     * Get the minimum amount to stake in order to register now as a server.
     */
    function getStakeRequirement() external view returns (uint) {
        return _stake.calculateAmount();
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
    }

    /**
     * Unregister a server. Contribution points are forfeited if no withdrawal is
     * made beforehand.
     */
    function serverUnregister() external onlyRegistered {
        _unregister(msg.sender);
    }

    /**
     * Withdraw rewards corresponding to a share of the treasury calculated from
     * contribution points.
     */
    function withdrawRewards() external onlyRegistered {
        Server storage s = _servers[msg.sender];
        uint serverContributions = s.contributions;
        uint treasury = _treasury;
        uint totalContributions = _totalContributions;

        uint rewards = (treasury * serverContributions) / totalContributions;
        payable(msg.sender).transfer(rewards);
        treasury -= rewards;
        totalContributions -= serverContributions;

        _treasury = treasury;
        _totalContributions = totalContributions;
        s.contributions = 0;
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
        if (_batchActualSize == 0) {
            revert EmptyBatch();
        }
        uint startedAt = _consensus[_batch.nonce].startedAt;
        BatchView memory batchView = BatchView({
            nonce: _batch.nonce,
            initialStateIpfsHash: _batch.initialStateIpfsHash,
            requests: new Request[](_batchActualSize),
            expiresAt: startedAt + _globalParams.consensusMaxDuration
        });
        for (uint i = 0; i < _batchActualSize; i++) {
            batchView.requests[i] = _batch.requests[i];
        }
        return batchView;
    }

    /**
     * Submit the result for a specific batch. Result is taken into account if and only if:
     * - Current batch nonce matches with the one provided in the response
     * - Current batch is not empty
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
        if (_batchActualSize == 0) {
            revert EmptyBatch();
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
        address[] memory inactiveServers = new address[](_serverSet.length());
        uint inactiveIndex = 0;
        for (uint i = 0; i < _serverSet.length(); i++) {
            address addr = _serverSet.at(i);
            uint elapsedSeen = block.timestamp - server.lastSeen;
            if (elapsedSeen > _globalParams.inactivityDuration) {
                // Inactive for more than inactivityDuration = unregister
                inactiveServers[inactiveIndex++] = addr;
            }
        }
        for (uint i = 0; i < inactiveIndex; i++) {
            _unregister(inactiveServers[i]);
        }
        _giveContributionPoints(server, _globalParams.housekeepReward);
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
        uint nonce;
        if (_requestQueue.head == _requestQueue.tail && _batchActualSize == 0) {
            nonce = _putRequestImmediatelyInBatch(requestIpfsHash);
        } else {
            nonce = _queueRequest(requestIpfsHash);
        }
        emit RequestSubmitted(nonce);
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

    function _queueRequest(
        string calldata requestIpfsHash
    ) internal returns (uint) {
        uint tail = _requestQueue.tail++;
        QueuedRequest storage q = _requestQueue.queue[tail];
        q.nonce = tail;
        q.ipfsHash = requestIpfsHash;
        q.sentAt = block.timestamp;
        q.author = msg.sender;
        return tail;
    }

    function _putRequestImmediatelyInBatch(
        string calldata requestIpfsHash
    ) internal returns (uint) {
        _requestQueue.head++;
        uint nonce = _requestQueue.tail++;
        Request storage r = _batch.requests[0];
        r.nonce = nonce;
        r.ipfsHash = requestIpfsHash;
        r.currentTime = block.timestamp;
        r.author = msg.sender;
        _batchActualSize = 1;
        _batch.nonce = _batchNonceGenerator++;
        _consensus[_batch.nonce].startedAt = block.timestamp;
        emit NextBatchReady();
        return nonce;
    }

    function _prepareNextBatch() internal {
        uint head = _requestQueue.head;
        uint tail = _requestQueue.tail;

        uint i = 0;
        while (head < tail && i < BATCH_SIZE) {
            Request storage r = _batch.requests[i];
            QueuedRequest storage q = _requestQueue.queue[head++];
            uint nonce = q.nonce;
            r.nonce = nonce;
            r.ipfsHash = q.ipfsHash;
            r.currentTime = block.timestamp;
            r.author = q.author;
            i++;
        }
        _batchActualSize = i;
        _batch.nonce = _batchNonceGenerator++;
        _consensus[_batch.nonce].startedAt = block.timestamp;
        _requestQueue.head = head;
        emit NextBatchReady();
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
            _globalParams.consensusQuorumPercent
        ) {
            if (
                (consensus.countByResult[consensus.resultWithLargestCount] *
                    100) /
                    consensus.serversWhoParticipated.length >=
                _globalParams.consensusRatioPercent
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
        BatchResult memory batchResult = _batchResults[resultHash];
        _batch.initialStateIpfsHash = batchResult.finalStateIpfsHash;
        for (uint i = 0; i < batchResult.responses.length; i++) {
            Response memory r = batchResult.responses[i];
            uint nonce = r.requestNonce;
            _responseByNonce[nonce] = r;
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
            }
            _servers[addr].lastSeen = block.timestamp;
        }
    }

    function _handleConsensusFailure() internal {
        for (uint i = 0; i < _batchActualSize; i++) {
            Request storage r = _batch.requests[i];
            emit RequestFailed(r.nonce);
        }
    }

    function _isConsensusExpired(
        Consensus storage consensus
    ) internal view returns (bool) {
        return
            block.timestamp - consensus.startedAt >
            _globalParams.consensusMaxDuration;
    }

    function _setNextHousekeepTimestamp(Server storage s) internal {
        s.nextHousekeepAt =
            block.timestamp +
            _globalParams.inactivityDuration *
            _serverSet.length();
    }

    function _giveContributionPoints(
        Server storage server,
        uint points
    ) internal {
        server.contributions += points;
        _totalContributions += points;
    }

    function _slash(address addr) internal {
        uint stake = _servers[addr].stake;
        uint toSlash = (stake * 2) / 100;
        stake -= toSlash;
        _servers[addr].stake = stake;
        _treasury += toSlash;
        if (stake < _globalParams.minStake) {
            _unregister(addr);
        }
    }

    function _unregister(address addr) internal {
        Server storage s = _servers[addr];
        payable(addr).transfer(s.stake);
        _serverSet.remove(addr);
        _totalContributions -= s.contributions;
        delete _servers[addr];
    }
}
