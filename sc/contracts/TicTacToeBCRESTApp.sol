// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BCREST} from "./BCREST.sol";

library Utils {
    function calculateRewardShare(
        uint balance,
        uint totalShares,
        uint userShares
    ) internal pure returns (uint) {
        require(totalShares > 0);
        require(userShares < totalShares);
        return (balance * userShares) / totalShares;
    }
}

contract TicTacToeBCRESTApp is BCREST {
    struct GlobalParams {
        uint defaultRequestCost;
        uint requestMaxTtl;
        uint minStake;
    }

    GlobalParams public globalParams;
    mapping(address => Server) private _servers;
    uint private _treasury;

    constructor(GlobalParams memory globalParams_) {
        globalParams = globalParams_;
        _treasury = 0;
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
        s.contributions = 0;
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

        uint rewards = Utils.calculateRewardShare(
            address(this).balance,
            treasury,
            serverContributions
        );
        payable(msg.sender).transfer(rewards);
        treasury -= serverContributions;

        _treasury = treasury;
        s.contributions = 0;
    }

    function getCurrentBatch() external view returns (Batch memory) {}

    function submitBatchResult(BatchResult calldata result) external {}

    // Functions called by clients

    function sendRequest(
        uint requestIpfsHash,
        uint ttl
    ) external returns (uint) {}

    function getResponse(uint nonce) external view returns (Response memory) {}

    // Internals

    function _requireRegistered(Server storage server) internal view {
        if (server.addr != msg.sender) {
            revert ServerNotRegistered();
        }
    }
}
