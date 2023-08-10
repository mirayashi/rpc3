// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

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
    mapping(uint => Consensus) private _consensus;
    mapping(uint => RevealedBatchResult) private _batchResults;
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
        if (!_consensus[batchNonce].isActive(globalParams)) {
            revert ConsensusNotActive();
        }
        _;
    }

    event BatchCompleted(uint indexed batchNonce);
    event BatchFailed(uint indexed batchNonce);
    event BatchResultHashSubmitted();
    event ConsensusReached(bytes32 indexed resultHash);
    event HousekeepSuccess(uint nextHousekeepTimestamp);
    event NextBatchReady();
    event RequestSubmitted(uint indexed requestNonce, uint indexed batchNonce);
    event ServerRegistered(address indexed addr);
    event ServerUnregistered(address indexed addr);

    error AwaitingResultReveal();
    error ConsensusNotActive();
    error ConsensusNotReached();
    error EmptyBatch();
    error HousekeepCooldown(uint nextHousekeepTimestamp);
    error InsufficientStake();
    error InvalidBatchNonce();
    error MaxServersReached();
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
        IPFSMultihash memory stateIpfsHash
    ) {
        globalParams = globalParams_;
        _stake.minAmount = globalParams.minStake;
        _batch.initialStateIpfsHash = stateIpfsHash;
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
        if (_serverSet.length() >= MAX_SERVERS) {
            revert MaxServersReached();
        }
        if (!_stake.tryStake()) {
            revert InsufficientStake();
        }
        s.addr = msg.sender;
        s.stake = msg.value;
        s.lastSeen = block.timestamp;
        s.contributions = 1;
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
        for (uint i; i < batchSize; ++i) {
            batchView.requests[i] = _requestQueue.queue[_batch.head + i];
        }
        return batchView;
    }

    /**
     * Get the hash of a batch result.
     */
    function hashResult(
        BatchResult calldata result
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(result));
    }

    /**
     * Submit the result hash for a specific batch. Result is taken into
     * account if and only if:
     * - Provided batch nonce is valid
     * - Result has not already been submitted
     * - Consensus has not expired
     */
    function submitBatchResultHash(
        uint batchNonce,
        bytes32 resultHash
    ) external onlyRegistered activeConsensus(batchNonce) {
        Consensus storage consensus = _consensus[batchNonce];
        if (consensus.reachedAt != 0) {
            revert AwaitingResultReveal();
        }
        if (consensus.hasParticipated(msg.sender)) {
            revert ResultAlreadySubmitted();
        }
        ConsensusState state = consensus.submitResultHash(
            globalParams,
            resultHash,
            _serverSet.length()
        );
        if (state == ConsensusState.SUCCESS) {
            emit ConsensusReached(resultHash);
        } else if (state == ConsensusState.FAILED) {
            _handleConsensusFailed();
        }
        _servers[msg.sender].lastSeen = block.timestamp;
        emit BatchResultHashSubmitted();
    }

    function encodeResult(
        BatchResult calldata result
    ) public pure returns (bytes memory) {
        return abi.encode(result);
    }

    /**
     * Reveal actual data of a batch result after consensus has been reached.
     * A backoff system exists so servers don't compete to be the first one to
     * call this function. Instead the smart contract decides who may be the
     * first one to call it (one server is randomly elected and won't have a
     * backoff).
     */
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
        bytes32 resultHash = hashResult(result);
        if (
            resultHash != consensus.resultWithLargestCount ||
            resultHash != consensus.resultsByServer[msg.sender]
        ) {
            revert ResultHashMismatch();
        }
        RevealedBatchResult storage revealedResult = _batchResults[
            result.nonce
        ];
        if (revealedResult.exists) return;
        revealedResult.exists = true;
        uint offset;
        uint i;
        while (offset < result.encodedResponses.length) {
            bytes calldata slice = result.encodedResponses[offset:offset +
                IPFS_HASH_PACKED_SIZE];
            Response storage res = revealedResult.responses[i];
            res.ipfsHash.header = bytes32(slice[:2]);
            res.ipfsHash.digest = bytes32(slice[2:]);
            offset = ++i * IPFS_HASH_PACKED_SIZE;
        }
        _batch.initialStateIpfsHash = result.finalStateIpfsHash;
        consensus.processContributions(
            resultHash,
            _serverInMajority,
            _serverInMinority
        );
        _giveContributionPoints(
            _servers[msg.sender],
            globalParams.revealReward
        );
        _servers[msg.sender].lastSeen = block.timestamp;
        // Deleting the whole consensus struct is the most gas-efficient way to
        // flip consensus.isActive() to false (resets startedAt to 0)
        delete _consensus[result.nonce];
        emit BatchCompleted(result.nonce);
        _prepareNextBatch();
    }

    function getResultRevealTimestamp(
        uint batchNonce
    ) external view onlyRegistered activeConsensus(batchNonce) returns (uint) {
        Consensus storage consensus = _consensus[batchNonce];
        if (consensus.reachedAt == 0) {
            revert ConsensusNotReached();
        }
        if (!consensus.hasParticipated(msg.sender)) {
            revert NotAConsensusParticipant();
        }
        return consensus.reachedAt + consensus.randomBackoffs[msg.sender];
    }

    /**
     * Servers are expected to call this function when the consensus of the current batch
     * has expired. This is so the protocol doesn't get stuck if nobody is submitting
     * results after batch expiration. One that successfully skips a batch via this function
     * receives a contribution point.
     */
    function skipBatchIfConsensusExpired() external onlyRegistered {
        uint batchNonce = _batch.nonce;
        Consensus storage consensus = _consensus[batchNonce];
        if (!consensus.isActive(globalParams)) {
            _handleConsensusFailed();
            _incContributionPoints(_servers[msg.sender]);
            _servers[msg.sender].lastSeen = block.timestamp;
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
        for (uint i; i < _serverSet.length(); ++i) {
            address addr = _serverSet.at(i);
            if (addr == msg.sender) continue;
            uint elapsedSeen = block.timestamp - _servers[addr].lastSeen;
            if (elapsedSeen > globalParams.inactivityDuration) {
                // Inactive for more than inactivityDuration = unregister
                inactiveServers[inactiveIndex++] = addr;
            }
        }
        for (uint i; i < inactiveIndex; ++i) {
            _slash(inactiveServers[i]);
            _unregister(inactiveServers[i]);
        }
        _giveContributionPoints(server, globalParams.housekeepReward);
        _servers[msg.sender].lastSeen = block.timestamp;
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
        Server memory memServer = _servers[msg.sender];
        memServer.contributions--; // Correct contribution count
        return memServer;
    }

    /**
     * Clients may send requests through this function. If current batch is empty,
     * it is loaded immediately in a batch, otherwise it is enqueued and will be
     * processed in next batch.
     */
    function sendRequest(IPFSMultihash calldata requestIpfsHash) external {
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
    function getResponse(
        uint nonce
    ) external view returns (IPFSMultihash memory) {
        address author = _requestQueue.queue[nonce].author;
        if (author != msg.sender) {
            revert RequestAuthorMismatch();
        }
        return _retrieveResponseFromNonce(nonce);
    }

    // --------------
    // Internals
    // --------------

    function _batchSize() internal view returns (uint) {
        return _requestQueue.head - _batch.head;
    }

    function _retrieveResponseFromNonce(
        uint nonce
    ) internal view returns (IPFSMultihash storage) {
        BatchCoordinates storage coords = _mapRequestNonceToBatchCoordinates[
            nonce
        ];
        RevealedBatchResult storage result = _batchResults[coords.batchNonce];
        if (!result.exists) {
            revert ResponseNotAvailable();
        }
        return result.responses[coords.position].ipfsHash;
    }

    function _queueRequest(IPFSMultihash calldata requestIpfsHash) internal {
        uint requestNonce = _requestQueue.tail++;
        Request storage req = _requestQueue.queue[requestNonce];
        req.ipfsHash = requestIpfsHash;
        req.author = msg.sender;
        (uint batchNonce, uint position) = _calculateAndSaveBatchCoordinates(
            requestNonce
        );
        _initResponseStorageAtPosition(batchNonce, position);
        emit RequestSubmitted(requestNonce, batchNonce);
    }

    function _calculateAndSaveBatchCoordinates(
        uint nonce
    ) internal returns (uint, uint) {
        uint queueHead = _requestQueue.head;
        uint queueTail = nonce + 1;
        uint queueSize = queueTail - queueHead;
        BatchCoordinates storage coords = _mapRequestNonceToBatchCoordinates[
            nonce
        ];
        uint batchNonce = _batch.nonce + 1 + (queueSize / BATCH_SIZE);
        uint position = queueSize % BATCH_SIZE;
        coords.batchNonce = batchNonce;
        coords.position = position;
        return (batchNonce, position);
    }

    /**
     * Initializes response at coordinate with some value so writing actual
     * response will consume less gas
     */
    function _initResponseStorageAtPosition(
        uint batchNonce,
        uint position
    ) internal {
        IPFSMultihash storage ipfsHash = _batchResults[batchNonce]
            .responses[position]
            .ipfsHash;
        ipfsHash.header = bytes32(uint(1));
        ipfsHash.digest = bytes32(uint(1));
    }

    function _prepareNextBatch() internal {
        uint oldHead = _requestQueue.head;
        uint newHead = Math.min(oldHead + BATCH_SIZE, _requestQueue.tail);
        _batch.head = oldHead;
        _requestQueue.head = newHead;
        if (newHead - oldHead > 0) {
            uint nonce = ++_batch.nonce;
            Consensus storage consensus = _consensus[nonce];
            consensus.startedAt = block.timestamp;
            emit NextBatchReady();
        }
    }

    function _handleConsensusFailed() internal {
        uint batchNonce = _batch.nonce;
        delete _consensus[batchNonce];
        emit BatchFailed(batchNonce);
        _prepareNextBatch();
    }

    function _serverInMajority(address addr) internal {
        _incContributionPoints(_servers[addr]);
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
        uint points
    ) internal {
        server.contributions += points;
        totalContributions += points;
    }

    function _incContributionPoints(Server storage server) internal {
        ++server.contributions;
        ++totalContributions;
    }

    function _resetContributionPoints(Server storage server) internal {
        totalContributions -= server.contributions - 1;
        server.contributions = 1;
    }

    function _calculateTreasuryShare(
        Server storage s
    ) internal view returns (uint) {
        if (totalContributions == 0) {
            return 0;
        }
        return (treasury * (s.contributions - 1)) / totalContributions;
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
