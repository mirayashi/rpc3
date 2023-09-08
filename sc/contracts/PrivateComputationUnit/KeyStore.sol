// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import {Sapphire} from "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import "./CipherStrategy.sol";

abstract contract KeyStore {
    using EnumerableSet for EnumerableSet.AddressSet;

    struct Key {
        bytes32 secret;
        EnumerableSet.AddressSet authorized;
    }

    CipherStrategy cipherStrategy;
    uint private _nonce;
    mapping(address => mapping(uint => Key)) private _keys;

    modifier checkKeyExists(address owner, uint nonce) {
        _checkKeyExists(owner, nonce);
        _;
    }

    event KeyCreated(address indexed owner, uint nonce, uint authorizedCount);

    error KeyNotFound();
    error KeyUnauthorized();

    constructor() {
        cipherStrategy = _cipherStrategy();
    }

    function _cipherStrategy() internal virtual returns (CipherStrategy) {
        return new SapphireStrategy();
    }

    function createKey() external {
        uint nonce = ++_nonce;
        Key storage key = _keys[msg.sender][nonce];
        key.secret = bytes32(
            Sapphire.randomBytes(32, bytes.concat(bytes32(nonce)))
        );
        emit KeyCreated(msg.sender, nonce, 0);
    }

    function createSharedKey(address[] calldata authorized) external {
        uint nonce = ++_nonce;
        Key storage key = _keys[msg.sender][nonce];
        key.secret = bytes32(
            Sapphire.randomBytes(32, bytes.concat(bytes32(nonce)))
        );
        for (uint i; i < authorized.length; ++i) {
            if (authorized[i] == msg.sender) continue;
            key.authorized.add(authorized[i]);
        }
        emit KeyCreated(msg.sender, nonce, key.authorized.length());
    }

    function keyExists(address owner, uint nonce) external view returns (bool) {
        return _keys[owner][nonce].secret != bytes32(0);
    }

    function encrypt(
        uint nonce,
        bytes calldata plaintext
    ) external view checkKeyExists(msg.sender, nonce) returns (bytes memory) {
        return _encryptUnchecked(msg.sender, nonce, plaintext);
    }

    function decrypt(
        address keyOwner,
        uint nonce,
        bytes calldata ciphertext
    ) external view checkKeyExists(keyOwner, nonce) returns (bytes memory) {
        Key storage key = _keys[keyOwner][nonce];
        if (keyOwner != msg.sender && !key.authorized.contains(msg.sender)) {
            revert KeyUnauthorized();
        }
        return _decryptUnchecked(keyOwner, nonce, ciphertext);
    }

    function getAuthorizedAddresses(
        address keyOwner,
        uint nonce
    ) external view checkKeyExists(keyOwner, nonce) returns (address[] memory) {
        Key storage key = _keys[keyOwner][nonce];
        return key.authorized.values();
    }

    function _checkKeyExists(address owner, uint nonce) internal view {
        if (_keys[owner][nonce].secret == bytes32(0)) {
            revert KeyNotFound();
        }
    }

    function _encryptUnchecked(
        address owner,
        uint nonce,
        bytes memory plaintext
    ) internal view returns (bytes memory) {
        Key storage key = _keys[owner][nonce];
        return cipherStrategy.encrypt(key.secret, nonce, plaintext);
    }

    function _decryptUnchecked(
        address owner,
        uint nonce,
        bytes memory ciphertext
    ) internal view returns (bytes memory) {
        Key storage key = _keys[owner][nonce];
        return cipherStrategy.decrypt(key.secret, nonce, ciphertext);
    }
}
