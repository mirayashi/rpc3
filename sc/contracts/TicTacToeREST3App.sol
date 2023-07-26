// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {REST3} from "./REST3.sol";

library Utils {
    function calculateRewardShare(
        uint balance,
        uint totalShares,
        uint userShares
    ) internal pure returns (uint) {
        require(totalShares > 0);
        require(userShares <= totalShares);
        return (balance * userShares) / totalShares;
    }
}

contract TicTacToeREST3App is REST3 {
    struct GlobalParams {
        uint defaultRequestCost;
        uint requestMaxTtl;
        uint minStake;
    }

    GlobalParams public globalParams;
    mapping(address => Server) private _servers;
    uint private _treasury;
    uint private _totalContributions;

    mapping(uint => QueuedRequest) private _queuedRequests;
    uint private _queuedRequestsHead;
    uint private _queuedRequestsTail;

    string public stateIpfsHash;

    constructor(
        GlobalParams memory globalParams_,
        string memory stateIpfsHash_
    ) {
        globalParams = globalParams_;
        stateIpfsHash = stateIpfsHash_;
    }

    // Functions called by servers

    function serverRegister() external payable {
        if (msg.value < globalParams.minStake) {
            revert InsufficientStake();
        }
        Server storage s = _servers[msg.sender];
        if (s.addr == msg.sender) {
            revert ServerAlreadyRegistered();
        }
        s.addr = msg.sender;
        s.stake = msg.value;
    }

    function serverUnregister() external {
        Server storage s = _servers[msg.sender];
        _requireRegistered(s);
        payable(msg.sender).transfer(s.stake);
        delete _servers[msg.sender];
    }

    function withdrawRewards() external {
        Server storage s = _servers[msg.sender];
        _requireRegistered(s);
        uint serverContributions = s.contributions;
        uint treasury = _treasury;
        uint totalContributions = _totalContributions;

        uint rewards = Utils.calculateRewardShare(
            treasury,
            totalContributions,
            serverContributions
        );
        payable(msg.sender).transfer(rewards);
        treasury -= rewards;
        totalContributions -= serverContributions;

        _treasury = treasury;
        _totalContributions = totalContributions;
        s.contributions = 0;
    }

    function getCurrentBatch() external view returns (Batch memory) {}

    function submitBatchResult(BatchResult calldata result) external {}

    // Functions called by clients

    function sendRequest(
        string calldata requestIpfsHash,
        uint ttl
    ) external returns (uint) {
        uint nonce = _queueRequest(requestIpfsHash, ttl);
        return nonce;
    }

    function getResponse(uint nonce) external view returns (Response memory) {}

    // Internals

    function _requireRegistered(Server storage server) internal view {
        if (server.addr != msg.sender) {
            revert ServerNotRegistered();
        }
    }

    function _queueRequest(
        string calldata requestIpfsHash,
        uint ttl
    ) internal returns (uint) {
        uint queuedRequestsTail = _queuedRequestsTail++;
        QueuedRequest storage q = _queuedRequests[queuedRequestsTail];
        q.nonce = queuedRequestsTail;
        q.ipfsHash = requestIpfsHash;
        q.sentAt = block.timestamp;
        q.ttl = ttl;
        return queuedRequestsTail;
    }
}
