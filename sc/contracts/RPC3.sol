// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {PullPayment} from "@openzeppelin/contracts/security/PullPayment.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./BusinessTypes.sol";
import {ConsensusLib, ConsensusState} from "./ConsensusLib.sol";
import {GlobalParamsValidator} from "./GlobalParamsValidator.sol";
import {PaginationLib, Pagination} from "./PaginationLib.sol";
import {StakeLib} from "./StakeLib.sol";

contract RPC3 is Ownable, Pausable, PullPayment, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;
    using StakeLib for StakeLib.Stake;
    using ConsensusLib for Consensus;
    using GlobalParamsValidator for GlobalParams;

    // Public state
    GlobalParams public globalParams;
    uint public treasury;
    StakeLib.Stake private _stake; // publicly exposed via getStakeRequirement()

    // Private state
    mapping(address => Server) private _servers;
    EnumerableSet.AddressSet private _serverSet;
    RequestQueue private _requestQueue;
    Batch private _batch;
    mapping(uint => Consensus) private _consensus;
    mapping(address => uint) private _pendingContributions;
    uint private _totalContributions;
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

    modifier withPendingContributions() {
        applyPendingContribution();
        _;
    }

    modifier canHousekeep() {
        Server storage server = _servers[msg.sender];
        if (_batch.nonce < server.nextHousekeepAt) {
            revert HousekeepCooldown(server.nextHousekeepAt);
        }
        _;
    }

    modifier whenFullyPaused() {
        _requirePaused();
        if (_batch.inProgress) {
            revert BatchInProgress();
        }
        _;
    }

    event AddedToTreasury(uint amount, uint royalties);
    event BatchCompleted(uint indexed batchNonce);
    event BatchFailed(uint indexed batchNonce);
    event BatchResultHashSubmitted();
    event GlobalParamsUpdated(GlobalParams newValue);
    event HousekeepSuccess(uint cleanCount, uint nextHousekeepTimestamp);
    event NextBatchReady(uint indexed batchNonce);
    event RequestSubmitted(uint indexed requestNonce, uint batchNonce);
    event ServerRegistered(address indexed addr);
    event ServerUnregistered(address indexed addr);

    error BatchInProgress();
    error ConsensusNotActive();
    error EmptyBatch();
    error HousekeepCooldown(uint nextHousekeepTimestamp);
    error InsufficientStake(uint expectedMinAmount);
    error InvalidBatchNonce();
    error InvalidRequestNonce();
    error MaxServersReached(uint limit);
    error ResultAlreadySubmitted();
    error ResponseNotAvailable();
    error RequestAuthorMismatch();
    error ServerAlreadyRegistered();
    error ServerNotRegistered();

    constructor(GlobalParams memory globalParams_, CID memory stateCid) {
        globalParams = globalParams_.validate();
        _stake.minAmount = globalParams.minStake;
        _batch.initialStateCid = stateCid;
    }

    /**
     * @dev Direct transfers to the contract address add funds to treasury.
     */
    receive() external payable {
        _addToTreasury(msg.value);
    }

    /**
     * @dev Pause the contract. When paused, the contract won't be accepting any more requests from users. Only the
     * owner may call this function.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Resume the contract. Users may submit requests again. Only the owner may call this function.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Update the global params of the contract. Requires the contract to be fully paused, that is, the contract
     * must be in a paused state (no more requests are being accepted) and no batch should be in progress (queue must be
     * empty). Only the owner may call this function.
     */
    function setGlobalParams(
        GlobalParams memory globalParams_
    ) external onlyOwner whenFullyPaused {
        globalParams = globalParams_.validate();
        emit GlobalParamsUpdated(globalParams_);
    }

    /**
     * @dev This function may be called by anyone who wants to add funds to treasury. Royalties are given to the owner
     * as specified in global params.
     */
    function donateToTreasury() external payable {
        _addToTreasury(msg.value);
    }

    /**
     * @dev Get the minimum amount to stake in order to register now as a server.
     */
    function getStakeRequirement() external view returns (uint) {
        return _stake.calculateAmount();
    }

    /**
     * @dev Get the number of servers currently registered
     */
    function getServerCount() external view returns (uint) {
        return _serverSet.length();
    }

    /**
     * @dev Get the IPFS CID of the data representing the state of the app.
     */
    function getStateCid() external view returns (CID memory) {
        return _batch.initialStateCid;
    }

    /**
     * @dev Get the current batch nonce.
     */
    function getCurrentBatchNonce() external view returns (uint) {
        return _batch.nonce;
    }

    /**
     * @dev Register as a server. Requires to send a value that is greater than or equal to the minimum stake
     * requirement accessible via getStakeRequirement().
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
            revert InsufficientStake(_stake.calculateAmount());
        }
        s.addr = msg.sender;
        s.stake = msg.value;
        s.lastSeen = _batch.nonce;
        s.contributions = 1;
        _serverSet.add(msg.sender);
        _setNextHousekeepNonce(s);
        emit ServerRegistered(msg.sender);
    }

    /**
     * @dev Unregister a server. Contribution points are forfeited if no withdrawal is made beforehand. Unregistering
     * costs a fee of a certain % of staked amount defined in global params (to discourage from unregistering only to
     * register again with a lower stake requirement).
     */
    function serverUnregister()
        external
        onlyRegistered
        withPendingContributions
    {
        _addToTreasury(_slash(msg.sender, globalParams.slashPercent));
        _unregister(msg.sender);
    }

    /**
     * @dev Check whether the caller is registered as a server.
     * @return bool
     */
    function amIRegistered() external view returns (bool) {
        return _serverSet.contains(msg.sender);
    }

    /**
     * @dev Calculate the rewards that can be claimed from the server's contributions. Does not take into account the
     * most recent contribution, hence "estimate". This can be worked around by calling applyPendingContribution()
     * before calling this function.
     */
    function estimateClaimableRewards()
        external
        view
        onlyRegistered
        returns (uint)
    {
        Server memory s = _servers[msg.sender];
        unchecked {
            --s.contributions;
        }
        return _calculateTreasuryShare(s.contributions, _totalContributions);
    }

    /**
     * @dev Claim rewards corresponding to a share of the treasury calculated from contribution points.
     */
    function claimRewards()
        external
        nonReentrant
        onlyRegistered
        withPendingContributions
    {
        Server storage s = _servers[msg.sender];
        uint shares;
        unchecked {
            shares = s.contributions - 1;
        }
        uint rewards = _calculateTreasuryShare(shares, _totalContributions);
        unchecked {
            treasury -= rewards;
        }
        _resetContributionPoints(s);
        payable(msg.sender).transfer(rewards);
    }

    /**
     * @dev Get all data from the current batch. Servers are expected to process each request in order, initializing
     * their state as per initialStateCid. The result is then later submitted via submitBatchResult().
     *
     * If the batch is too large, this function is paginated so it may be necessary to call this function once for each
     * page in order to get the full batch data.
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
            initialStateCid: _batch.initialStateCid,
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
     * @dev Submit the result for a specific batch. Result is taken into account if and only if:
     * - Provided batch nonce is valid
     * - Result has not already been submitted
     * - Consensus has not expired
     *
     * If the conditions above pass, three situations are possible:
     * - Consensus is still awaiting more results from other servers: the result passed to this function will simply be
     *   recorded and no other action will be made.
     * - Consensus between servers has been reached: the result that has been agreed on (may be different from the one
     *   passed to this function) is made available to clients through getResponse(), and each server who participated
     *   will receive a reward point accordingly next time they will interact with the contract. If the queue is not
     *   empty, a new batch will be prepared.
     * - Consensus between servers has failed (required majority not reached): batch is marked as failed and moves on to
     *   next batch (if queue is not empty).
     */
    function submitBatchResult(
        uint batchNonce,
        BatchResult calldata result
    )
        external
        onlyRegistered
        activeConsensus(batchNonce)
        withPendingContributions
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
            _handleConsensusSuccess(batchNonce);
        } else if (state == ConsensusState.FAILED) {
            _handleConsensusFailed(batchNonce);
        }
        _pendingContributions[msg.sender] = batchNonce;
        _servers[msg.sender].lastSeen = batchNonce;
        emit BatchResultHashSubmitted();
    }

    /**
     * @dev Servers are expected to call this function when the consensus of the current batch has expired. This is so
     * the protocol doesn't get stuck if nobody is submitting results after batch expiration. One that successfully
     * skips a batch via this function receives a contribution point.
     */
    function skipBatchIfConsensusExpired()
        external
        onlyRegistered
        withPendingContributions
    {
        uint batchNonce = _batch.nonce;
        Consensus storage consensus = _consensus[batchNonce];
        if (!consensus.isActive(globalParams)) {
            _handleConsensusFailed(batchNonce);
            _incContributionPoints(_servers[msg.sender]);
            _servers[msg.sender].lastSeen = batchNonce;
        }
    }

    /**
     * @dev Servers that are allowed to start a housekeep process may grab a list of inactive servers here. Since
     * looping through all servers is quite expensive, this function is paginated. Note that pagination is made based on
     * the whole set of registered servers, not the set of actually inactive servers. So it is possible to have a
     * multi-page result where each page contain very few or no elements at all.
     */
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
        address[] memory inactiveServers = new address[](HOUSEKEEP_MAX_SIZE);
        uint inactiveIndex;
        uint batchNonce = _batch.nonce;
        for (
            uint i;
            i < pg.currentPageSize && inactiveIndex < HOUSEKEEP_MAX_SIZE;
            ++i
        ) {
            address addr = _serverSet.at(pg.offset + i);
            if (addr == msg.sender) continue;
            uint inactiveFor = batchNonce - _servers[addr].lastSeen;
            if (inactiveFor > globalParams.inactivityThreshold) {
                // Inactive for more than inactivityThreshold = unregister
                inactiveServers[inactiveIndex++] = addr;
            }
        }
        // Reduce the size of the array to fit content
        uint sizeDelta = HOUSEKEEP_MAX_SIZE - inactiveIndex;
        if (sizeDelta > 0) {
            assembly {
                mstore(inactiveServers, sub(mload(inactiveServers), sizeDelta))
            }
        }
        return (inactiveServers, pg.maxPage);
    }

    /**
     * @dev Clean up inactive servers. A single server may call this function once in a while, cooldown gets higher as
     * more servers join the protocol. Each call guarantee a base amount of contribution points on success, even if
     * called with empty array or an array with some active servers. This is to encourage servers to call this function
     * immediately when cooldown is over, instead of having them wait until more servers become inactive, which may
     * create competition between housekeepers (which is the very thing the cooldown logic is designed to combat).
     */
    function housekeepInactive(
        address[] calldata inactiveServers
    ) external onlyRegistered canHousekeep withPendingContributions {
        Server storage server = _servers[msg.sender];
        uint length = Math.min(inactiveServers.length, HOUSEKEEP_MAX_SIZE);
        uint cleanCount;
        uint totalSlashed;
        uint slashPercent = globalParams.slashPercent;
        uint inactivityThreshold = globalParams.inactivityThreshold;
        uint batchNonce = _batch.nonce;
        for (uint i; i < length; ++i) {
            address addr = inactiveServers[i];
            if (addr == msg.sender || !_serverSet.contains(addr)) continue;
            uint inactiveFor;
            unchecked {
                inactiveFor = batchNonce - _servers[addr].lastSeen;
            }
            if (inactiveFor > inactivityThreshold) {
                totalSlashed += _slash(addr, slashPercent);
                _unregister(addr);
                unchecked {
                    ++cleanCount;
                }
            }
        }
        if (totalSlashed > 0) {
            _addToTreasury(totalSlashed);
        }
        _giveContributionPoints(
            server,
            globalParams.housekeepBaseReward +
                cleanCount *
                globalParams.housekeepCleanReward
        );
        _servers[msg.sender].lastSeen = batchNonce;
        _setNextHousekeepNonce(server);
        emit HousekeepSuccess(cleanCount, server.nextHousekeepAt);
    }

    /**
     * @dev Apply last contribution of the current server. It is generally not necessary to call this manually as it is
     * done automatically when interacting with the contract. But it may be useful in order to get more accurate
     * information when calling estimateClaimableRewards() or getServerData().
     */
    function applyPendingContribution() public onlyRegistered {
        uint lastContribution = _pendingContributions[msg.sender];
        if (lastContribution == 0) return;
        Consensus storage consensus = _consensus[lastContribution];
        if (consensus.hasPositivelyContributed(msg.sender)) {
            _incContributionPoints(_servers[msg.sender]);
        }
        _pendingContributions[msg.sender] = 0;
    }

    /**
     * @dev Get all data related to the server calling this function.
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
     * @dev Clients may send requests through this function. If current batch is empty, it is loaded immediately in a
     * singleton batch, otherwise it is enqueued and will be processed in next batch.
     */
    function sendRequest(CID calldata requestCid) external whenNotPaused {
        _queueRequest(requestCid);
        if (_batchSize() == 0) {
            _batch.inProgress = true;
            _prepareNextBatch();
        }
    }

    /**
     * @dev Clients may read the response for their request here. They are expected to listen to BatchCompleted events
     * matching the batch nonce they got from submitting the request (RequestSubmitted event) and then call this
     * function passing the request nonce.
     */
    function getResponse(
        uint requestNonce
    ) external view returns (CID memory, uint) {
        address author = _requestQueue.queue[requestNonce].author;
        if (author == address(0)) {
            revert InvalidRequestNonce();
        }
        if (author != msg.sender) {
            revert RequestAuthorMismatch();
        }
        return _retrieveResponseFromNonce(requestNonce);
    }

    // --------------
    // Internals
    // --------------

    function _addToTreasury(uint value) internal {
        uint royalties = (value * globalParams.ownerRoyaltiesPercent) / 100;
        uint toAdd;
        unchecked {
            toAdd = value - royalties;
        }
        treasury += toAdd;
        emit AddedToTreasury(toAdd, royalties);
        _asyncTransfer(owner(), royalties);
    }

    function _batchSize() internal view returns (uint) {
        unchecked {
            return _requestQueue.head - _batch.head;
        }
    }

    function _retrieveResponseFromNonce(
        uint nonce
    ) internal view returns (CID storage, uint position) {
        BatchCoordinates storage coords = _mapRequestNonceToBatchCoordinates[
            nonce
        ];
        Consensus storage consensus = _consensus[coords.batchNonce];
        BatchResult storage result = consensus.resultsByHash[
            consensus.resultWithLargestCount
        ];
        if (result.responseCid.digest == bytes32(0)) {
            revert ResponseNotAvailable();
        }
        return (result.responseCid, coords.position);
    }

    function _queueRequest(CID calldata requestCid) internal {
        uint requestNonce = _requestQueue.tail++;
        Request storage req = _requestQueue.queue[requestNonce];
        req.cid = requestCid;
        req.author = msg.sender;
        uint batchNonce = _calculateAndSaveBatchCoordinates(requestNonce);
        emit RequestSubmitted(requestNonce, batchNonce);
    }

    function _calculateAndSaveBatchCoordinates(
        uint nonce
    ) internal returns (uint) {
        uint queueHead = _requestQueue.head;
        uint maxBatchSize = globalParams.maxBatchSize;
        BatchCoordinates storage coords = _mapRequestNonceToBatchCoordinates[
            nonce
        ];
        unchecked {
            uint positionInQueue = nonce - queueHead;
            uint batchNonce = _batch.nonce +
                (positionInQueue / maxBatchSize) +
                1;
            coords.batchNonce = batchNonce;
            coords.position = positionInQueue % maxBatchSize;
            return batchNonce;
        }
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
            uint nonce;
            unchecked {
                // Latest batch nonce is always <= latest request nonce So request counter would have reached max value
                // way before batch counter
                nonce = ++_batch.nonce;
            }
            Consensus storage consensus = _consensus[nonce];
            consensus.startedAt = block.timestamp;
            emit NextBatchReady(nonce);
        } else {
            _batch.inProgress = false;
        }
    }

    function _handleConsensusSuccess(uint batchNonce) internal {
        BatchResult storage result = _consensus[batchNonce].finalResult();
        _batch.initialStateCid = result.finalStateCid;
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

    function _setNextHousekeepNonce(Server storage s) internal {
        s.nextHousekeepAt =
            _batch.nonce +
            globalParams.inactivityThreshold *
            _serverSet.length();
    }

    function _giveContributionPoints(
        Server storage server,
        uint points
    ) internal {
        server.contributions += points;
        _totalContributions += points;
    }

    function _incContributionPoints(Server storage server) internal {
        ++server.contributions;
        ++_totalContributions;
    }

    function _resetContributionPoints(Server storage server) internal {
        unchecked {
            _totalContributions -= server.contributions - 1;
        }
        server.contributions = 1;
    }

    function _calculateTreasuryShare(
        uint share,
        uint total
    ) internal view returns (uint) {
        if (total == 0) {
            return 0;
        }
        return
            Math.min(
                (treasury * share) / total,
                share * globalParams.contributionPointMaxValue
            );
    }

    function _slash(address addr, uint slashPercent) internal returns (uint) {
        uint stake = _servers[addr].stake;
        uint toSlash = (stake * slashPercent) / 100;
        unchecked {
            stake -= toSlash;
        }
        _servers[addr].stake = stake;
        return toSlash;
    }

    function _unregister(address addr) internal {
        Server storage s = _servers[addr];
        _asyncTransfer(addr, s.stake);
        _serverSet.remove(addr);
        _resetContributionPoints(s);
        delete _servers[addr];
        emit ServerUnregistered(addr);
    }
}
