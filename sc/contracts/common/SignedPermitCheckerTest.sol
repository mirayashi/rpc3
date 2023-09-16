// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import {SignedPermitChecker} from "./SignedPermitChecker.sol";
import "./CipherStrategy.sol";

/**
 * Sapphire precompiles do not work in Hardhat tests, so we are using a different cipher strategy.
 */
contract SignedPermitCheckerTest is SignedPermitChecker {
    function _cipherStrategy() internal override returns (CipherStrategy) {
        return new TestStrategy();
    }

    function foo(
        SignedPermit calldata sp
    ) external view onlyPermitted(sp) returns (bool) {
        return true;
    }
}
