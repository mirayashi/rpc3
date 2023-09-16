// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import {RPC3} from "./RPC3.sol";
import "./BusinessTypes.sol";
import "../common/CipherStrategy.sol";

/**
 * Sapphire precompiles do not work in Hardhat tests, so we are using a different cipher strategy.
 */
contract RPC3Test is RPC3 {
    constructor(
        GlobalParams memory globalParams_,
        CID memory stateCid
    ) RPC3(globalParams_, stateCid) {}

    function _cipherStrategy() internal override returns (CipherStrategy) {
        return new TestStrategy();
    }
}
