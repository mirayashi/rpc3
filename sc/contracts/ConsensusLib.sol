// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import "./BusinessTypes.sol";

enum ConsensusState {
    ONGOING,
    SUCCESS,
    FAILED
}

library ConsensusLib {
    function submitResult(
        Consensus storage self,
        GlobalParams storage globalParams,
        BatchResult calldata result,
        uint totalServers
    ) internal returns (ConsensusState) {
        bytes32 resultHash = keccak256(abi.encode(result));
        self.resultsByServer[msg.sender] = resultHash;
        if (
            self.resultsByHash[resultHash].responseIpfsHash.digest == bytes32(0)
        ) {
            self.resultsByHash[resultHash] = result;
        }
        self.serversWhoParticipated[self.numberOfParticipants++] = msg.sender;
        uint count = ++self.countByResult[resultHash];
        if (count > self.countByResult[self.resultWithLargestCount]) {
            self.resultWithLargestCount = resultHash;
        }
        if (
            (self.numberOfParticipants * 100) / totalServers >=
            globalParams.consensusQuorumPercent
        ) {
            if (
                (self.countByResult[self.resultWithLargestCount] * 100) /
                    self.numberOfParticipants >=
                globalParams.consensusMajorityPercent
            ) {
                return ConsensusState.SUCCESS;
            } else {
                return ConsensusState.FAILED;
            }
        }
        return ConsensusState.ONGOING;
    }

    function isActive(
        Consensus storage self,
        GlobalParams storage globalParams
    ) internal view returns (bool) {
        uint startedAt = self.startedAt;
        if (startedAt == 0) return false;
        return block.timestamp - startedAt <= globalParams.consensusMaxDuration;
    }

    function hasParticipated(
        Consensus storage self,
        address addr
    ) internal view returns (bool) {
        return self.resultsByServer[addr] != bytes32(0);
    }
}
