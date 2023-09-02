// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import {Sapphire} from "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

contract PrivateComputationUnit {
    mapping(address => mapping(string => bytes32)) private _keys;

    modifier checkKeyExists(string calldata name) {
        if (_keys[msg.sender][name] == bytes32(0)) {
            revert KeyNotFound();
        }
        _;
    }

    event KeyGenerated(address indexed owner, bytes32 nameHash);
    event KeyRevoked(address indexed owner, bytes32 nameHash);

    error KeyNotFound();
    error KeyAlreadyExists();

    function createKey(string calldata name) external {
        if (_keys[msg.sender][name] != bytes32(0)) {
            revert KeyAlreadyExists();
        }
        _keys[msg.sender][name] = bytes32(
            Sapphire.randomBytes(32, bytes(name))
        );
        emit KeyGenerated(msg.sender, keccak256(bytes(name)));
    }

    function revokeKey(string calldata name) external checkKeyExists(name) {
        _keys[msg.sender][name] = 0;
        emit KeyRevoked(msg.sender, keccak256(bytes(name)));
    }

    function keyExists(string calldata name) external view returns (bool) {
        return _keys[msg.sender][name] != bytes32(0);
    }

    function encrypt(
        string calldata keyName,
        uint nonce,
        bytes calldata plaintext,
        bytes calldata ad
    ) external view checkKeyExists(keyName) returns (bytes memory) {
        bytes32 key = _keys[msg.sender][keyName];
        return Sapphire.encrypt(key, bytes32(nonce), plaintext, ad);
    }

    function decrypt(
        string calldata keyName,
        uint nonce,
        bytes calldata ciphertext,
        bytes calldata ad
    ) external view checkKeyExists(keyName) returns (bytes memory) {
        bytes32 key = _keys[msg.sender][keyName];
        return Sapphire.decrypt(key, bytes32(nonce), ciphertext, ad);
    }
}
