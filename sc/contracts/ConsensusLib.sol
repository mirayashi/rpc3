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
    function submitResultHash(
        Consensus storage self,
        bytes32 resultHash
    ) internal returns (ConsensusState) {
        self.resultsByServer[msg.sender] = resultHash;
        uint8 randomBackoff = uint8(Sapphire.randomBytes(1, "")[0]) % 24;
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
                self.reachedAt = block.timestamp;
                state = ConsensusState.SUCCESS;
            } else {
                state = ConsensusState.FAILED;
            }
        }
        return state;
    }

    function isExpired(Consensus storage self) internal view returns (bool) {
        return block.timestamp - self.startedAt > self.maxDuration;
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
