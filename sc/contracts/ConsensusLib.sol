// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Sapphire} from "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";
import "./BusinessTypes.sol";

enum ConsensusState {
    ONGOING,
    SUCCESS,
    FAILED
}

library ConsensusLib {
    function _rand(uint8 min, uint8 max) private view returns (uint8) {
        uint8 range = max - min;
        return (uint8(bytes1(Sapphire.randomBytes(1, ""))) % range) + min;
    }

    /**
     * A randomly elected priority server will have its random backoff
     * set to zero.
     */
    function _electPriorityServer(Consensus storage consensus) private {
        uint randIndex = uint(bytes32(Sapphire.randomBytes(32, ""))) %
            consensus.serversWhoParticipated.length;
        address elected = consensus.serversWhoParticipated[randIndex];
        consensus.randomBackoffs[elected] = 0;
    }

    function submitResultHash(
        Consensus storage self,
        bytes32 resultHash
    ) internal returns (ConsensusState) {
        self.resultsByServer[msg.sender] = resultHash;
        uint8 randomBackoff = _rand(
            self.randomBackoffMin,
            self.randomBackoffMax
        );
        self.randomBackoffs[msg.sender] = randomBackoff;
        self.serversWhoParticipated.push(msg.sender);
        uint count = ++self.countByResult[resultHash];
        if (count > self.countByResult[self.resultWithLargestCount]) {
            self.resultWithLargestCount = resultHash;
        }
        ConsensusState state = ConsensusState.ONGOING;
        if (
            (self.serversWhoParticipated.length * 100) / self.totalServers >=
            self.targetQuorum
        ) {
            if (
                (self.countByResult[self.resultWithLargestCount] * 100) /
                    self.serversWhoParticipated.length >=
                self.targetRatio
            ) {
                _electPriorityServer(self);
                self.reachedAt = block.timestamp;
                state = ConsensusState.SUCCESS;
            } else {
                state = ConsensusState.FAILED;
            }
        }
        return state;
    }

    function isActive(Consensus storage self) internal view returns (bool) {
        return
            !self.completed &&
            block.timestamp - self.startedAt <= self.maxDuration;
    }

    function hasParticipated(
        Consensus storage self,
        address addr
    ) internal view returns (bool) {
        return self.resultsByServer[addr] != bytes32(0);
    }

    function processContributions(
        Consensus storage self,
        bytes32 resultHash,
        function(address) callbackInMajority,
        function(address) callbackInMinority
    ) internal {
        uint participantsCount = self.serversWhoParticipated.length;
        for (uint i = 0; i < participantsCount; i++) {
            address addr = self.serversWhoParticipated[i];
            bytes32 resultOfServer = self.resultsByServer[addr];
            if (resultOfServer == resultHash) {
                // Server in majority = give a contribution point
                callbackInMajority(addr);
            } else {
                // Server in minority = slash stake
                callbackInMinority(addr);
            }
        }
    }
}
