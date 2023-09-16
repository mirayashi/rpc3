// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import {KeyStore} from "./KeyStore.sol";

contract PrivateComputationUnit is KeyStore {
    function incrementCounter(
        SignedPermit calldata sp,
        bytes calldata counterCiphertext,
        bytes calldata incrementCiphertext
    ) external view onlyPermitted(sp) returns (bytes memory) {
        Decrypted memory counterDecrypted = _decrypt(counterCiphertext);
        Decrypted memory incrementDecrypted = _decrypt(incrementCiphertext);
        uint counter = uint(bytes32(counterDecrypted.plaintext));
        uint increment = uint(bytes32(incrementDecrypted.plaintext));
        uint result = counter + increment;
        return
            _encrypt(
                counterDecrypted.keyOwner,
                counterDecrypted.keyNonce,
                bytes.concat(bytes32(result))
            );
    }
}
