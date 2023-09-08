// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import {GlobalParams} from "./BusinessTypes.sol";

library GlobalParamsValidator {
    struct Violation {
        string field;
        string reason;
    }

    uint constant CHECKS_COUNT = 5;

    error InvalidGlobalParams(Violation[] violations);

    function validate(
        GlobalParams memory self
    ) internal pure returns (GlobalParams memory) {
        Violation[] memory violations = new Violation[](CHECKS_COUNT);
        uint i;
        violations[i] = _require(
            self.minStake > 0,
            "minStake",
            "should be nonzero"
        );
        if (bytes(violations[i].field).length > 0) ++i;
        violations[i] = _require(
            self.consensusQuorumPercent >= 1 &&
                self.consensusQuorumPercent <= 100,
            "consensusQuorumPercent",
            "should be between 1 and 100"
        );
        if (bytes(violations[i].field).length > 0) ++i;
        violations[i] = _require(
            self.consensusMajorityPercent >= 51 &&
                self.consensusMajorityPercent <= 100,
            "consensusMajorityPercent",
            "should be between 51 and 100"
        );
        if (bytes(violations[i].field).length > 0) ++i;
        violations[i] = _require(
            self.ownerRoyaltiesPercent <= 100,
            "ownerRoyaltiesPercent",
            "should be between 0 and 100"
        );
        if (bytes(violations[i].field).length > 0) ++i;
        violations[i] = _require(
            self.slashPercent <= 100,
            "slashPercent",
            "should be between 0 and 100"
        );
        if (bytes(violations[i].field).length > 0) ++i;
        // Reduce array size to fit content
        uint delta = CHECKS_COUNT - i;
        if (delta > 0) {
            assembly {
                mstore(violations, sub(mload(violations), delta))
            }
        }
        if (violations.length > 0) {
            revert InvalidGlobalParams(violations);
        }
        return self;
    }

    function _require(
        bool expr,
        string memory field,
        string memory reason
    ) private pure returns (Violation memory) {
        if (expr) return Violation("", "");
        else return Violation(field, reason);
    }
}
