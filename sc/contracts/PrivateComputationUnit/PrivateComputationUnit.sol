// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import {KeyStore} from "./KeyStore.sol";

contract PrivateComputationUnit is KeyStore {
    struct Decrypted {
        address keyOwner;
        uint keyNonce;
        bytes plaintext;
    }

    function incrementCounter(
        bytes calldata state,
        bytes calldata params
    ) external view returns (bytes memory) {
        Decrypted memory decryptedState = _decryptInput(state);
        Decrypted memory decryptedParams = _decryptInput(params);
        uint currentCounter = uint(bytes32(decryptedState.plaintext));
        uint incrementSteps = uint(bytes32(decryptedParams.plaintext));
        uint result = currentCounter + incrementSteps;
        return _encryptOutput(decryptedState, bytes.concat(bytes32(result)));
    }

    function _decryptInput(
        bytes calldata input
    ) internal view returns (Decrypted memory) {
        require(input.length >= 52);
        address keyOwner = address(bytes20(input[:20]));
        uint keyNonce = uint(bytes32(input[20:52]));
        _checkKeyExists(keyOwner, keyNonce);
        return
            Decrypted(
                keyOwner,
                keyNonce,
                _decryptUnchecked(keyOwner, keyNonce, input[52:])
            );
    }

    function _encryptOutput(
        Decrypted memory decryptedState,
        bytes memory output
    ) internal view returns (bytes memory) {
        return
            bytes.concat(
                bytes20(decryptedState.keyOwner),
                bytes32(decryptedState.keyNonce),
                _encryptUnchecked(
                    decryptedState.keyOwner,
                    decryptedState.keyNonce,
                    output
                )
            );
    }
}