// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import {PrivateComputationUnit} from "./PrivateComputationUnit.sol";
import "./CipherStrategy.sol";

/**
 * Sapphire precompiles do not work in Hardhat tests, so we are using a different cipher strategy.
 */
contract PrivateComputationUnitTest is PrivateComputationUnit {
    function _cipherStrategy() internal override returns (CipherStrategy) {
        return new TestStrategy();
    }
}
