// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import {Sapphire} from "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface CipherStrategy {
    function encrypt(
        bytes32 secret,
        uint nonce,
        bytes memory plaintext
    ) external view returns (bytes memory);

    function decrypt(
        bytes32 secret,
        uint nonce,
        bytes memory ciphertext
    ) external view returns (bytes memory);
}

contract XORStrategy is CipherStrategy {
    function encrypt(
        bytes32 secret,
        uint nonce,
        bytes memory plaintext
    ) external view returns (bytes memory) {
        return this._xor(secret, nonce, plaintext);
    }

    function decrypt(
        bytes32 secret,
        uint nonce,
        bytes memory ciphertext
    ) external view returns (bytes memory) {
        return this._xor(secret, nonce, ciphertext);
    }

    function _xor(
        bytes32 secret,
        uint nonce,
        bytes memory data
    ) external pure returns (bytes memory) {
        uint length = data.length;
        bytes memory result;
        assembly {
            result := mload(0x40)
            mstore(0x40, add(add(result, length), 32))
            mstore(result, length)
        }
        bytes32 key = keccak256(bytes.concat(secret, bytes32(nonce)));
        for (uint offset; offset < length; offset += 32) {
            bytes32 chunk;
            assembly {
                chunk := mload(add(data, add(offset, 32)))
            }
            chunk ^= key;
            assembly {
                mstore(add(result, add(offset, 32)), chunk)
            }
        }
        return result;
    }
}

contract SapphireStrategy is CipherStrategy {
    function encrypt(
        bytes32 secret,
        uint nonce,
        bytes memory plaintext
    ) external view returns (bytes memory) {
        return Sapphire.encrypt(secret, bytes32(nonce << 17), plaintext, "");
    }

    function decrypt(
        bytes32 secret,
        uint nonce,
        bytes memory ciphertext
    ) external view returns (bytes memory) {
        return Sapphire.decrypt(secret, bytes32(nonce << 17), ciphertext, "");
    }
}
