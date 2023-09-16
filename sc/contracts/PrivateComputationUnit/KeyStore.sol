// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import {Sapphire} from "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {SignedPermitChecker} from "../common/SignedPermitChecker.sol";

abstract contract KeyStore is SignedPermitChecker {
    using EnumerableSet for EnumerableSet.AddressSet;

    struct Key {
        bytes32 secret;
        EnumerableSet.AddressSet authorized;
    }

    struct Decrypted {
        address keyOwner;
        uint keyNonce;
        bytes plaintext;
    }

    uint private _nonce;
    mapping(address => mapping(uint => Key)) private _keys;

    modifier checkKeyExists(address owner, uint nonce) {
        _checkKeyExists(owner, nonce);
        _;
    }

    event KeyCreated(address indexed owner, uint nonce, uint authorizedCount);

    error KeyNotFound();
    error KeyUnauthorized();

    function createKey() external {
        (uint nonce, ) = _newKey();
        emit KeyCreated(msg.sender, nonce, 0);
    }

    function createSharedKey(address[] calldata authorized) external {
        (uint nonce, Key storage key) = _newKey();
        for (uint i; i < authorized.length; ++i) {
            if (authorized[i] == msg.sender) continue;
            key.authorized.add(authorized[i]);
        }
        emit KeyCreated(msg.sender, nonce, key.authorized.length());
    }

    function keyExists(address owner, uint nonce) external view returns (bool) {
        return _keys[owner][nonce].secret != bytes32(0);
    }

    function getAuthorizedAddresses(
        address keyOwner,
        uint nonce
    ) external view checkKeyExists(keyOwner, nonce) returns (address[] memory) {
        Key storage key = _keys[keyOwner][nonce];
        return key.authorized.values();
    }

    function encrypt(
        SignedPermit calldata sp,
        uint nonce,
        bytes calldata plaintext
    )
        external
        view
        checkKeyExists(msg.sender, nonce)
        onlyPermitted(sp)
        returns (bytes memory)
    {
        return _encrypt(msg.sender, nonce, plaintext);
    }

    function decrypt(
        SignedPermit calldata sp,
        bytes calldata ciphertext
    ) external view onlyPermitted(sp) returns (bytes memory) {
        Decrypted memory decrypted = _decrypt(ciphertext);
        Key storage key = _keys[decrypted.keyOwner][decrypted.keyNonce];
        if (
            decrypted.keyOwner != msg.sender &&
            !key.authorized.contains(msg.sender)
        ) {
            revert KeyUnauthorized();
        }
        return decrypted.plaintext;
    }

    // ----------------------
    //       Internals
    // ----------------------

    function _encrypt(
        address owner,
        uint nonce,
        bytes memory plaintext
    ) internal view returns (bytes memory) {
        Key storage key = _keys[owner][nonce];
        bytes memory ciphertext = cipherStrategy.encrypt(
            key.secret,
            nonce,
            plaintext
        );
        return bytes.concat(bytes20(owner), bytes32(nonce), ciphertext);
    }

    function _decrypt(
        bytes calldata ciphertext
    ) internal view returns (Decrypted memory) {
        require(ciphertext.length >= 52);
        address keyOwner = address(bytes20(ciphertext[:20]));
        uint keyNonce = uint(bytes32(ciphertext[20:52]));
        _checkKeyExists(keyOwner, keyNonce);
        Key storage key = _keys[keyOwner][keyNonce];
        bytes memory plaintext = cipherStrategy.decrypt(
            key.secret,
            keyNonce,
            ciphertext[52:]
        );
        return Decrypted(keyOwner, keyNonce, plaintext);
    }

    function _newKey() internal returns (uint, Key storage) {
        uint nonce = ++_nonce;
        Key storage key = _keys[msg.sender][nonce];
        key.secret = cipherStrategy.randomBytes32(nonce);
        return (nonce, key);
    }

    function _checkKeyExists(address owner, uint nonce) internal view {
        if (_keys[owner][nonce].secret == bytes32(0)) {
            revert KeyNotFound();
        }
    }
}
