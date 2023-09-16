// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import {Sapphire} from "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface CipherStrategy {
    function randomBytes32(uint nonce) external view returns (bytes32);

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

contract TestStrategy is CipherStrategy {
    function randomBytes32(uint nonce) external view returns (bytes32) {
        return
            keccak256(bytes.concat(bytes32(block.timestamp), bytes32(nonce)));
        // Obviously not secure but this is only used in tests
    }

    function encrypt(
        bytes32 secret,
        uint nonce,
        bytes memory plaintext
    ) external pure returns (bytes memory) {
        return _xor(secret, nonce, plaintext);
    }

    function decrypt(
        bytes32 secret,
        uint nonce,
        bytes memory ciphertext
    ) external pure returns (bytes memory) {
        return _xor(secret, nonce, ciphertext);
    }

    function _xor(
        bytes32 secret,
        uint nonce,
        bytes memory data
    ) internal pure returns (bytes memory) {
        uint length = data.length;
        bytes memory result;
        assembly {
            result := mload(0x40)
            mstore(0x40, add(add(result, length), 32))
            mstore(result, length)
        }
        bytes32 key = secret;
        for (uint offset; offset < length; offset += 32) {
            key = keccak256(bytes.concat(key, bytes32(nonce)));
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
    function randomBytes32(uint nonce) external view returns (bytes32) {
        return bytes32(Sapphire.randomBytes(32, bytes.concat(bytes32(nonce))));
    }

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

abstract contract CipherEnabled {
    CipherStrategy immutable cipherStrategy;

    constructor() {
        cipherStrategy = _cipherStrategy();
    }

    function _cipherStrategy() internal virtual returns (CipherStrategy) {
        return new SapphireStrategy();
    }
}
