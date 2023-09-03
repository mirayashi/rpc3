// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import {Sapphire} from "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {PaginationLib, Pagination} from "./PaginationLib.sol";

contract PrivateComputationUnit {
    using EnumerableSet for EnumerableSet.AddressSet;

    struct Key {
        bytes32 secret;
        EnumerableSet.AddressSet authorized;
    }

    uint constant ELEMENTS_PER_PAGE = 50;

    mapping(address => mapping(string => Key)) private _keys;

    modifier checkKeyExists(address owner, string calldata name) {
        if (_keys[owner][name].secret == bytes32(0)) {
            revert KeyNotFound();
        }
        _;
    }

    event KeyGenerated(address indexed owner, string name);
    event KeyRevoked(address indexed owner, string name);
    event KeyAccessGranted(
        address indexed owner,
        string name,
        address[] targets
    );
    event KeyAccessRevoked(
        address indexed owner,
        string name,
        address[] targets
    );

    error KeyNotFound();
    error KeyAlreadyExists();
    error CannotDestroySharedKey();
    error KeyUnauthorized();

    function createKey(string calldata name) external {
        Key storage key = _keys[msg.sender][name];
        if (key.secret != bytes32(0)) {
            revert KeyAlreadyExists();
        }
        key.secret = bytes32(Sapphire.randomBytes(32, bytes(name)));
        emit KeyGenerated(msg.sender, name);
    }

    function destroyKey(
        string calldata name
    ) external checkKeyExists(msg.sender, name) {
        Key storage key = _keys[msg.sender][name];
        if (key.authorized.length() > 0) {
            revert CannotDestroySharedKey();
        }
        _keys[msg.sender][name].secret = 0;
        emit KeyRevoked(msg.sender, name);
    }

    function keyExists(
        address owner,
        string calldata name
    ) external view returns (bool) {
        return _keys[owner][name].secret != bytes32(0);
    }

    function encrypt(
        address keyOwner,
        string calldata keyName,
        uint nonce,
        bytes calldata plaintext,
        bytes calldata ad
    ) external view checkKeyExists(keyOwner, keyName) returns (bytes memory) {
        Key storage key = _keys[keyOwner][keyName];
        return
            Sapphire.encrypt(key.secret, bytes32(nonce << 17), plaintext, ad);
    }

    function decrypt(
        address keyOwner,
        string calldata keyName,
        uint nonce,
        bytes calldata ciphertext,
        bytes calldata ad
    ) external view checkKeyExists(keyOwner, keyName) returns (bytes memory) {
        Key storage key = _keys[keyOwner][keyName];
        if (keyOwner != msg.sender && !key.authorized.contains(msg.sender)) {
            revert KeyUnauthorized();
        }
        return
            Sapphire.decrypt(key.secret, bytes32(nonce << 17), ciphertext, ad);
    }

    function grantAccess(
        string calldata keyName,
        address[] calldata targets
    ) external checkKeyExists(msg.sender, keyName) {
        Key storage key = _keys[msg.sender][keyName];
        for (uint i; i < targets.length; ++i) {
            if (targets[i] == msg.sender) continue;
            key.authorized.add(targets[i]);
        }
        emit KeyAccessGranted(msg.sender, keyName, targets);
    }

    function revokeAccess(
        string calldata keyName,
        address[] calldata targets
    ) external checkKeyExists(msg.sender, keyName) {
        Key storage key = _keys[msg.sender][keyName];
        for (uint i; i < targets.length; ++i) {
            if (targets[i] == msg.sender) continue;
            key.authorized.remove(targets[i]);
        }
        emit KeyAccessRevoked(msg.sender, keyName, targets);
    }

    function isGranted(
        address keyOwner,
        string calldata keyName,
        address target
    ) external view checkKeyExists(keyOwner, keyName) returns (bool) {
        return
            keyOwner == target ||
            _keys[keyOwner][keyName].authorized.contains(target);
    }

    function getAuthorizedAddresses(
        address keyOwner,
        string calldata keyName,
        uint page
    )
        external
        view
        checkKeyExists(keyOwner, keyName)
        returns (address[] memory, uint)
    {
        Key storage key = _keys[keyOwner][keyName];
        Pagination memory pg = PaginationLib.paginate(
            page,
            key.authorized.length(),
            ELEMENTS_PER_PAGE
        );
        address[] memory result = new address[](pg.currentPageSize);
        for (uint i; i < pg.currentPageSize; ++i) {
            result[i] = key.authorized.at(pg.offset + i);
        }
        return (result, pg.maxPage);
    }
}
