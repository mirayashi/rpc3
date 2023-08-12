// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GlobalParams} from "./BusinessTypes.sol";

library GlobalParamsValidator {
    struct Violation {
        string field;
        string reason;
    }

    error InvalidGlobalParams(Violation[] violations);

    function validate(
        GlobalParams memory self
    ) internal pure returns (GlobalParams memory) {
        Violation[] memory violations = new Violation[](4);
        uint i;
        violations[i] = _require(
            self.minStake > 0,
            "minStake",
            "should be nonzero"
        );
        if (bytes(violations[i].field).length > 0) ++i;
        violations[i] = _require(
            self.consensusQuorumPercent > 0 &&
                self.consensusQuorumPercent <= 100,
            "consensusQuorumPercent",
            "should be between 1 and 100"
        );
        if (bytes(violations[i].field).length > 0) ++i;
        violations[i] = _require(
            self.consensusRatioPercent >= 51 &&
                self.consensusRatioPercent <= 100,
            "consensusRatioPercent",
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
        uint delta = 4 - i;
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
