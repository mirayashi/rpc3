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

    error EmptyBatch();
    error ServerAlreadyRegistered();
    error ServerNotRegistered();
    error InsufficientStake();
    error InvalidBatchNonce();
    error ResultAlreadySubmitted();
    error ResponseNotAvailable();
    error RequestAuthorMismatch();

    constructor(GlobalParams memory globalParams, string memory stateIpfsHash) {
        _globalParams = globalParams;
        _stake.minAmount = globalParams.minStake;
        _batch.initialStateIpfsHash = stateIpfsHash;
        _requestQueue.head = 1;
        _requestQueue.tail = 1;
    }

    function donateToTreasury() external payable {
        _treasury += msg.value;
    }

    // Functions called by servers

    function getStakeAmount() external view returns (uint) {
        return _stake.calculateAmount();
    }

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
    }

    function serverUnregister() external onlyRegistered {
        _unregister(msg.sender);
    }

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

    function skipBatchIfConsensusExpired() external {
        Consensus storage consensus = _consensus[_batch.nonce];
        if (_isConsensusExpired(consensus)) {
            _handleConsensusFailure();
            _prepareNextBatch();
            _housekeepInactive();
            emit BatchSkipped();
        } else {
            emit NoActionTaken();
        }
    }

    function getContributionData()
        external
        view
        onlyRegistered
        returns (Server memory)
    {
        return _servers[msg.sender];
    }

    // Functions called by clients

    function sendRequest(string calldata requestIpfsHash) external {
        uint nonce;
        if (_requestQueue.head == _requestQueue.tail && _batchActualSize == 0) {
            nonce = _putRequestImmediatelyInBatch(requestIpfsHash);
        } else {
            nonce = _queueRequest(requestIpfsHash);
        }
        emit RequestSubmitted(nonce);
    }

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
                _servers[addr].contributions++;
                _totalContributions++;
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

    function _housekeepInactive() internal {
        address[] memory inactiveServers = new address[](_serverSet.length());
        uint inactiveIndex = 0;
        for (uint i = 0; i < _serverSet.length(); i++) {
            address addr = _serverSet.at(i);
            if (
                block.timestamp - _servers[addr].lastSeen >
                _globalParams.inactivityDuration
            ) {
                // Inactive for more than inactivityDuration = unregister
                inactiveServers[inactiveIndex++] = addr;
            }
        }
        for (uint i = 0; i < inactiveIndex; i++) {
            _unregister(inactiveServers[i]);
        }
        uint reward = _globalParams.housekeepReward;
        _servers[msg.sender].contributions += reward;
        _totalContributions += reward;
        _servers[msg.sender].lastSeen = block.timestamp;
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
