// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Sapphire} from "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

import "./BusinessTypes.sol";
import {StakeLib} from "./StakeLib.sol";
import {ConsensusLib, ConsensusState} from "./ConsensusLib.sol";

import "hardhat/console.sol";

contract REST3App {
    using EnumerableSet for EnumerableSet.AddressSet;
    using StakeLib for StakeLib.Stake;
    using ConsensusLib for Consensus;

    GlobalParams public globalParams;
    uint public treasury;
    uint public totalContributions;
    StakeLib.Stake private _stake; // publicly exposed via getStakeRequirement()

    mapping(address => Server) private _servers;
    EnumerableSet.AddressSet private _serverSet;

    RequestQueue private _requestQueue;

    Batch private _batch;
    uint _batchNonceGenerator;
    mapping(uint => Consensus) private _consensus;
    mapping(bytes32 => RevealedBatchResult) private _batchResults;
    mapping(uint => bytes32) private _mapBatchNonceToResultHash;
    mapping(uint => BatchCoordinates)
        private _mapRequestNonceToBatchCoordinates;

    modifier onlyRegistered() {
        if (!_serverSet.contains(msg.sender)) {
            revert ServerNotRegistered();
        }
        _;
    }

    modifier activeConsensus(uint batchNonce) {
        if (batchNonce > _batch.nonce) {
            revert InvalidBatchNonce();
        }
        Consensus storage consensus = _consensus[batchNonce];
        if (consensus.completed || consensus.isExpired()) {
            revert ConsensusExpiredOrCompleted();
        }
        _;
    }

    event BatchCompleted(uint indexed batchNonce);
    event BatchFailed(uint indexed batchNonce);
    event BatchResultIgnored();
    event BatchResultRecorded();
    event ConsensusReached(bytes32 indexed resultHash);
    event HousekeepSuccess(uint nextHousekeepTimestamp);
    event NextBatchReady();
    event NoActionTaken();
    event RequestSubmitted(uint indexed requestNonce, uint indexed batchNonce);
    event ServerRegistered(address indexed addr);
    event ServerUnregistered(address indexed addr);

    error BatchSizeMismatch(uint expectedSize);
    error ConsensusExpiredOrCompleted();
    error ConsensusNotReached();
    error EmptyBatch();
    error HousekeepCooldown(uint nextHousekeepTimestamp);
    error InsufficientStake();
    error InvalidBatchNonce();
    error NotAConsensusParticipant();
    error ResultAlreadySubmitted();
    error NotYetTimeToReveal();
    error ResponseNotAvailable();
    error ResultHashMismatch();
    error RequestAuthorMismatch();
    error ServerAlreadyRegistered();
    error ServerNotRegistered();

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

    function revealBatchResult(
        BatchResult calldata result
    ) external onlyRegistered activeConsensus(result.nonce) {
        Consensus storage consensus = _consensus[result.nonce];
        uint reachedAt = consensus.reachedAt;
        if (reachedAt == 0) {
            revert ConsensusNotReached();
        }
        if (
            block.timestamp < reachedAt + consensus.randomBackoffs[msg.sender]
        ) {
            revert NotYetTimeToReveal();
        }
        bytes32 resultHash = keccak256(abi.encode(result));
        if (resultHash != consensus.resultWithLargestCount) {
            revert ResultHashMismatch();
        }
        RevealedBatchResult storage revealedResult = _batchResults[resultHash];
        if (!revealedResult.exists) {
            revealedResult.exists = true;
            revealedResult.finalStateIpfsHash = result.finalStateIpfsHash;
            for (uint i = 0; i < result.responseIpfsHashes.length; i++) {
                Response storage res = revealedResult.responses.push();
                res.ipfsHash = result.responseIpfsHashes[i];
            }
            _batch.initialStateIpfsHash = _batchResults[resultHash]
                .finalStateIpfsHash;
            _mapBatchNonceToResultHash[result.nonce] = resultHash;
            consensus.processContributions(
                resultHash,
                _serverInMajority,
                _serverInMinority
            );
            consensus.completed = true;
            emit BatchCompleted(result.nonce);
            _prepareNextBatch();
        }
    }

    /**
     * Submit the result hash for a specific batch. Result is taken into account if and only if:
     * - Provided batch nonce is valid
     * - Result has not already been submitted
     * - Consensus has not expired
     */
    function submitBatchResultHash(
        uint batchNonce,
        bytes32 resultHash
    ) external onlyRegistered activeConsensus(batchNonce) {
        if (batchNonce > _batch.nonce) {
            revert InvalidBatchNonce();
        }
        Consensus storage consensus = _consensus[batchNonce];
        if (consensus.hasParticipated(msg.sender)) {
            revert ResultAlreadySubmitted();
        }
        ConsensusState state = consensus.submitResultHash(resultHash);
        if (state == ConsensusState.SUCCESS) {
            emit ConsensusReached(resultHash);
        } else if (state == ConsensusState.FAILED) {
            consensus.completed = true;
            emit BatchFailed(_batch.nonce);
            _prepareNextBatch();
        }
        _servers[msg.sender].lastSeen = block.timestamp;
        emit BatchResultRecorded();
    }

    function getResultRevealTimestamp(
        uint batchNonce
    ) external view onlyRegistered activeConsensus(batchNonce) returns (uint) {
        Consensus storage consensus = _consensus[batchNonce];
        if (!consensus.hasParticipated(msg.sender)) {
            revert NotAConsensusParticipant();
        }
        return consensus.randomBackoffs[msg.sender];
    }

    /**
     * Servers are expected to call this function when the consensus of the current batch
     * has expired. This is so the protocol doesn't get stuck if nobody is submitting
     * responses after batch expiration. One that successfully skips a batch via this function
     * receives a contribution point.
     */
    function skipBatchIfConsensusExpired() external onlyRegistered {
        uint batchNonce = _batch.nonce;
        Consensus storage consensus = _consensus[batchNonce];
        if (!consensus.completed && consensus.isExpired()) {
            emit BatchFailed(batchNonce);
            _prepareNextBatch();
            _giveContributionPoints(_servers[msg.sender], 1);
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
        _queueRequest(requestIpfsHash);
        if (_batchSize() == 0) {
            _prepareNextBatch();
        }
    }

    /**
     * Clients may read the response for their request here. They are expected
     * to listen to ResponseReceived events matching their request nonce and
     * then call this function.
     */
    function getResponse(uint nonce) external view returns (string memory) {
        string memory r = _retrieveResponseFromNonce(nonce);
        address author = _requestQueue.queue[nonce].author;
        if (author == address(0)) {
            revert ResponseNotAvailable();
        }
        if (author != msg.sender) {
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

    function _retrieveResponseFromNonce(
        uint nonce
    ) internal view returns (string storage) {
        BatchCoordinates storage coords = _mapRequestNonceToBatchCoordinates[
            nonce
        ];
        return
            _batchResults[_mapBatchNonceToResultHash[coords.batchNonce]]
                .responses[coords.position]
                .ipfsHash;
    }

    function _queueRequest(string calldata requestIpfsHash) internal {
        uint requestNonce = _requestQueue.tail++;
        Request storage req = _requestQueue.queue[requestNonce];
        req.ipfsHash = requestIpfsHash;
        req.author = msg.sender;
        uint batchNonce = _calculateAndSaveBatchCoordinates(requestNonce);
        emit RequestSubmitted(requestNonce, batchNonce);
    }

    function _calculateAndSaveBatchCoordinates(
        uint nonce
    ) internal returns (uint) {
        uint queueHead = _requestQueue.head;
        uint queueTail = _requestQueue.tail;
        uint queueSize = queueTail - queueHead;
        BatchCoordinates storage coords = _mapRequestNonceToBatchCoordinates[
            nonce
        ];
        uint batchNonce = _batch.nonce + 1 + (queueSize / BATCH_SIZE);
        coords.batchNonce = batchNonce;
        coords.position = queueSize % BATCH_SIZE;
        return batchNonce;
    }

    function _prepareNextBatch() internal {
        uint oldHead = _requestQueue.head;
        uint newHead = Math.min(oldHead + BATCH_SIZE, _requestQueue.tail);
        if (newHead - oldHead > 0) {
            _batch.head = oldHead;
            _requestQueue.head = newHead;
            uint nonce = _batchNonceGenerator++;
            _batch.nonce = nonce;
            Consensus storage consensus = _consensus[nonce];
            consensus.startedAt = block.timestamp;
            consensus.totalServers = _serverSet.length();
            consensus.targetQuorum = globalParams.consensusQuorumPercent;
            consensus.targetRatio = globalParams.consensusRatioPercent;
            consensus.maxDuration = globalParams.consensusMaxDuration;
            emit NextBatchReady();
        }
    }

    function _serverInMajority(address addr) internal {
        _giveContributionPoints(_servers[addr], 1);
    }

    function _serverInMinority(address addr) internal {
        _slash(addr);
        if (_servers[addr].stake < globalParams.minStake) {
            _unregister(addr);
        }
    }

    function _setNextHousekeepTimestamp(Server storage s) internal {
        s.nextHousekeepAt =
            block.timestamp +
            globalParams.inactivityDuration *
            _serverSet.length();
    }

    function _giveContributionPoints(
        Server storage server,
        uint16 points
    ) internal {
        uint16 oldContrib = server.contributions;
        if (oldContrib == type(uint16).max) return;
        unchecked {
            uint16 newContrib = oldContrib + points;
            if (newContrib < oldContrib) {
                newContrib = type(uint16).max;
            }
            server.contributions = newContrib;
            totalContributions += newContrib - oldContrib;
        }
        server.lastSeen = block.timestamp;
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
}
