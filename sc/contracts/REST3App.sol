// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import "./BusinessTypes.sol";
import {StakeLib} from "./StakeLib.sol";
import {ConsensusLib, ConsensusState} from "./ConsensusLib.sol";
import {PaginationLib, Pagination} from "./PaginationLib.sol";
import {GlobalParamsValidator} from "./GlobalParamsValidator.sol";

import "hardhat/console.sol";

contract REST3App is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using StakeLib for StakeLib.Stake;
    using ConsensusLib for Consensus;
    using GlobalParamsValidator for GlobalParams;

    bool public maintenanceMode;

    GlobalParams public globalParams;
    uint public treasury;
    uint public totalContributions;
    StakeLib.Stake private _stake; // publicly exposed via getStakeRequirement()

    mapping(address => Server) private _servers;
    EnumerableSet.AddressSet private _serverSet;

    RequestQueue private _requestQueue;

    Batch private _batch;
    mapping(uint => Consensus) private _consensus;
    mapping(address => uint) private _lastContribution;
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

    modifier withLatestContributions() {
        if (!applyLastContribution()) {
            return;
        }
        _;
    }

    modifier canHousekeep() {
        Server storage server = _servers[msg.sender];
        if (block.timestamp < server.nextHousekeepAt) {
            revert HousekeepCooldown(server.nextHousekeepAt);
        }
        _;
    }

    modifier whenProtocolIsPaused() {
        if (!maintenanceMode) {
            revert MaintenanceModeRequired();
        }
        if (_batch.inProgress) {
            revert BatchInProgress();
        }
        _;
    }

    event BatchCompleted(uint indexed batchNonce);
    event BatchFailed(uint indexed batchNonce);
    event BatchResultHashSubmitted();
    event HousekeepSuccess(uint cleanCount, uint nextHousekeepTimestamp);
    event NextBatchReady();
    event RequestSubmitted(uint indexed requestNonce);
    event ServerRegistered(address indexed addr);
    event ServerUnregistered(address indexed addr);

    error BatchInProgress();
    error ConsensusNotActive();
    error EmptyBatch();
    error HousekeepCooldown(uint nextHousekeepTimestamp);
    error InsufficientStake();
    error InvalidBatchNonce();
    error MaintenanceModeEnabled();
    error MaintenanceModeRequired();
    error MaxServersReached(uint limit);
    error ResultAlreadySubmitted();
    error ResponseNotAvailable();
    error RequestAuthorMismatch();
    error ServerAlreadyRegistered();
    error ServerNotRegistered();

    constructor(
        GlobalParams memory globalParams_,
        IPFSMultihash memory stateIpfsHash
    ) {
        globalParams = globalParams_.validate();
        _stake.minAmount = globalParams.minStake;
        _batch.initialStateIpfsHash = stateIpfsHash;
    }

    receive() external payable {
        donateToTreasury();
    }

    function setMaintenanceMode(bool value) external onlyOwner {
        maintenanceMode = value;
    }

    function setGlobalParams(
        GlobalParams memory globalParams_
    ) external onlyOwner whenProtocolIsPaused {
        globalParams = globalParams_.validate();
    }

    function setGlobalParamsAndDisableMaintenanceMode(
        GlobalParams memory globalParams_
    ) external onlyOwner whenProtocolIsPaused {
        globalParams = globalParams_.validate();
        maintenanceMode = false;
    }

    /**
     * This function may be called by anyone who wants to add funds to treasury.
     * Royalties are given to the owner as specified in global params.
     */
    function donateToTreasury() public payable {
        uint royalties = (msg.value * globalParams.ownerRoyaltiesPercent) / 100;
        treasury += msg.value - royalties;
        payable(owner()).transfer(royalties);
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
        if (_serverSet.length() == globalParams.maxServers) {
            revert MaxServersReached(globalParams.maxServers);
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
     * defined in global params (to discourage from unregistering only to register
     * again with a lower stake requirement).
     */
    function serverUnregister()
        external
        onlyRegistered
        withLatestContributions
    {
        treasury += _slash(msg.sender, globalParams.slashPercent);
        _unregister(msg.sender);
    }

    /**
     * Calculate the rewards that can be claimed from the server's contributions.
     * Does not take into account the most recent contribution, hence "estimate".
     */
    function estimateClaimableRewards()
        external
        view
        onlyRegistered
        returns (uint)
    {
        Server memory s = _servers[msg.sender];
        --s.contributions;
        return _calculateTreasuryShare(s.contributions, totalContributions);
    }

    /**
     * Claim rewards corresponding to a share of the treasury calculated from
     * contribution points.
     */
    function claimRewards() external onlyRegistered withLatestContributions {
        Server storage s = _servers[msg.sender];
        uint rewards = _calculateTreasuryShare(
            (s.contributions - 1),
            totalContributions
        );
        payable(msg.sender).transfer(rewards);
        treasury -= rewards;
        _resetContributionPoints(s);
    }

    /**
     * Get all data from the current batch.
     */
    function getCurrentBatch(
        uint page
    ) external view onlyRegistered returns (BatchView memory) {
        uint batchSize = _batchSize();
        if (batchSize == 0) {
            revert EmptyBatch();
        }
        Pagination memory pg = PaginationLib.paginate(
            page,
            batchSize,
            BATCH_PAGE_SIZE
        );
        uint startedAt = _consensus[_batch.nonce].startedAt;
        BatchView memory batchView = BatchView({
            nonce: _batch.nonce,
            page: page,
            maxPage: pg.maxPage,
            initialStateIpfsHash: _batch.initialStateIpfsHash,
            requests: new Request[](pg.currentPageSize),
            expiresAt: startedAt + globalParams.consensusMaxDuration
        });
        uint head = _batch.head;
        for (uint i; i < pg.currentPageSize; ++i) {
            batchView.requests[i] = _requestQueue.queue[head + pg.offset + i];
        }
        return batchView;
    }

    /**
     * Submit the result hash for a specific batch. Result is taken into
     * account if and only if:
     * - Provided batch nonce is valid
     * - Result has not already been submitted
     * - Consensus has not expired
     */
    function submitBatchResult(
        uint batchNonce,
        BatchResult calldata result
    )
        external
        onlyRegistered
        activeConsensus(batchNonce)
        withLatestContributions
    {
        Consensus storage consensus = _consensus[batchNonce];
        if (consensus.hasParticipated(msg.sender)) {
            revert ResultAlreadySubmitted();
        }
        ConsensusState state = consensus.submitResult(
            globalParams,
            result,
            _serverSet.length()
        );
        if (state == ConsensusState.SUCCESS) {
            _handleConsensusSuccess(batchNonce, result);
        } else if (state == ConsensusState.FAILED) {
            _handleConsensusFailed(batchNonce);
        }
        _lastContribution[msg.sender] = batchNonce;
        _servers[msg.sender].lastSeen = block.timestamp;
        emit BatchResultHashSubmitted();
    }

    /**
     * Servers are expected to call this function when the consensus of the current batch
     * has expired. This is so the protocol doesn't get stuck if nobody is submitting
     * results after batch expiration. One that successfully skips a batch via this function
     * receives a contribution point.
     */
    function skipBatchIfConsensusExpired()
        external
        onlyRegistered
        withLatestContributions
    {
        uint batchNonce = _batch.nonce;
        Consensus storage consensus = _consensus[batchNonce];
        if (!consensus.isActive(globalParams)) {
            _handleConsensusFailed(batchNonce);
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

    function getInactiveServers(
        uint page
    )
        external
        view
        onlyRegistered
        canHousekeep
        returns (address[] memory, uint)
    {
        Pagination memory pg = PaginationLib.paginate(
            page,
            _serverSet.length(),
            INACTIVE_SERVERS_PAGE_SIZE
        );
        address[] memory inactiveServers = new address[](pg.currentPageSize);
        uint inactiveIndex;
        for (uint i; i < pg.currentPageSize; ++i) {
            address addr = _serverSet.at(pg.offset + i);
            if (addr == msg.sender) continue;
            uint elapsedSeen = block.timestamp - _servers[addr].lastSeen;
            if (elapsedSeen > globalParams.inactivityDuration) {
                // Inactive for more than inactivityDuration = unregister
                inactiveServers[inactiveIndex++] = addr;
            }
        }
        // Reduce the size of the array to fit content
        uint sizeDelta = pg.currentPageSize - inactiveIndex;
        if (sizeDelta > 0) {
            assembly {
                mstore(inactiveServers, sub(mload(inactiveServers), sizeDelta))
            }
        }
        return (inactiveServers, pg.maxPage);
    }

    /**
     * Clean up inactive servers. A single server may
     * call this function once in a while, cooldown gets higher as more servers
     * join the protocol. Each call give contribution points on success, even if
     * no server is inactive
     */
    function housekeepInactive(
        address[] calldata inactiveServers
    ) external onlyRegistered canHousekeep withLatestContributions {
        Server storage server = _servers[msg.sender];
        uint length = Math.min(inactiveServers.length, HOUSEKEEP_MAX_SIZE);
        uint cleanCount;
        uint totalSlashed;
        uint slashPercent = globalParams.slashPercent;
        uint inactivityDuration = globalParams.inactivityDuration;
        for (uint i; i < length; ++i) {
            address addr = inactiveServers[i];
            if (addr == msg.sender || !_serverSet.contains(addr)) continue;
            uint elapsedSeen = block.timestamp - _servers[addr].lastSeen;
            if (elapsedSeen > inactivityDuration) {
                totalSlashed += _slash(addr, slashPercent);
                _unregister(addr);
                ++cleanCount;
            }
        }
        if (totalSlashed > 0) treasury += totalSlashed;
        _giveContributionPoints(
            server,
            globalParams.housekeepBaseReward +
                cleanCount *
                globalParams.housekeepCleanReward
        );
        _servers[msg.sender].lastSeen = block.timestamp;
        _setNextHousekeepTimestamp(server);
        emit HousekeepSuccess(cleanCount, server.nextHousekeepAt);
    }

    /**
     * Apply last contribution of the current server.
     * It is generally not necessary to call this manually as it is done
     * automatically when interacting with the contract. But it may be useful
     * in order to get more accurate information when calling
     * estimateClaimableRewards() or getServerData().
     *
     * @return bool false if the server got unregistered following this operation.
     */
    function applyLastContribution() public onlyRegistered returns (bool) {
        Contribution contribution = _getLastContribution();
        _lastContribution[msg.sender] = 0;
        if (contribution == Contribution.REWARD) {
            _incContributionPoints(_servers[msg.sender]);
            return true;
        } else if (contribution == Contribution.SLASH) {
            treasury += _slash(msg.sender, globalParams.slashPercent);
            if (_servers[msg.sender].stake < globalParams.minStake) {
                _unregister(msg.sender);
                return false;
            }
        }
        return true;
    }

    /**
     * Get all data related to the server calling this function.
     */
    function getServerData()
        external
        view
        onlyRegistered
        returns (Server memory)
    {
        Server memory s = _servers[msg.sender];
        s.contributions--;
        return s;
    }

    /**
     * Clients may send requests through this function. If current batch is empty,
     * it is loaded immediately in a batch, otherwise it is enqueued and will be
     * processed in next batch.
     */
    function sendRequest(IPFSMultihash calldata requestIpfsHash) external {
        if (maintenanceMode) {
            revert MaintenanceModeEnabled();
        }
        _queueRequest(requestIpfsHash);
        if (_batchSize() == 0) {
            _batch.inProgress = true;
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
    ) external view returns (IPFSMultihash memory, uint position) {
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
    ) internal view returns (IPFSMultihash storage, uint position) {
        BatchCoordinates storage coords = _mapRequestNonceToBatchCoordinates[
            nonce
        ];
        Consensus storage consensus = _consensus[coords.batchNonce];
        BatchResult storage result = consensus.resultsByHash[
            consensus.resultWithLargestCount
        ];
        if (result.responseIpfsHash.digest == bytes32(0)) {
            revert ResponseNotAvailable();
        }
        return (result.responseIpfsHash, coords.position);
    }

    function _queueRequest(IPFSMultihash calldata requestIpfsHash) internal {
        uint requestNonce = _requestQueue.tail++;
        Request storage req = _requestQueue.queue[requestNonce];
        req.ipfsHash = requestIpfsHash;
        req.author = msg.sender;
        _calculateAndSaveBatchCoordinates(requestNonce);
        emit RequestSubmitted(requestNonce);
    }

    function _calculateAndSaveBatchCoordinates(uint nonce) internal {
        uint queueHead = _requestQueue.head;
        uint queueTail = nonce + 1;
        uint queueSize = queueTail - queueHead;
        BatchCoordinates storage coords = _mapRequestNonceToBatchCoordinates[
            nonce
        ];
        uint batchNonce = _batch.nonce + 1 + (queueSize / BATCH_PAGE_SIZE);
        uint position = queueSize % BATCH_PAGE_SIZE;
        coords.batchNonce = batchNonce;
        coords.position = position;
    }

    function _prepareNextBatch() internal {
        uint oldHead = _requestQueue.head;
        uint newHead = Math.min(
            oldHead + globalParams.maxBatchSize,
            _requestQueue.tail
        );
        _batch.head = oldHead;
        _requestQueue.head = newHead;
        if (newHead - oldHead > 0) {
            uint nonce = ++_batch.nonce;
            Consensus storage consensus = _consensus[nonce];
            consensus.startedAt = block.timestamp;
            emit NextBatchReady();
        } else {
            _batch.inProgress = false;
        }
    }

    function _handleConsensusSuccess(
        uint batchNonce,
        BatchResult calldata result
    ) internal {
        _batch.initialStateIpfsHash = result.finalStateIpfsHash;
        // the most gas-efficient way to flip consensus.isActive() to false
        delete _consensus[batchNonce].startedAt;
        emit BatchCompleted(batchNonce);
        _prepareNextBatch();
    }

    function _handleConsensusFailed(uint batchNonce) internal {
        // There won't be any result available so we can delete the whole struct
        delete _consensus[batchNonce];
        emit BatchFailed(batchNonce);
        _prepareNextBatch();
    }

    function _getLastContribution() internal view returns (Contribution) {
        uint lastContribution = _lastContribution[msg.sender];
        if (lastContribution == 0) return Contribution.NEUTRAL;
        Consensus storage consensus = _consensus[lastContribution];
        bytes32 resultHash = consensus.resultWithLargestCount;
        if (resultHash == bytes32(0)) return Contribution.NEUTRAL;
        if (consensus.resultsByServer[msg.sender] == resultHash) {
            return Contribution.REWARD;
        } else {
            return Contribution.SLASH;
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
        uint share,
        uint total
    ) internal view returns (uint) {
        if (total == 0) {
            return 0;
        }
        return (treasury * share) / total;
    }

    function _slash(address addr, uint slashPercent) internal returns (uint) {
        uint stake = _servers[addr].stake;
        uint toSlash = (stake * slashPercent) / 100;
        stake -= toSlash;
        _servers[addr].stake = stake;
        return toSlash;
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
