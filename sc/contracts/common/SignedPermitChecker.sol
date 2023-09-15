// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Sapphire} from "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

contract SignedPermitChecker is EIP712 {
    struct Permit {
        address requester;
        uint expiry;
        bytes randomPart;
    }

    struct SignedPermit {
        uint nonce;
        bytes cipheredPermit;
        bytes signature;
    }

    uint constant PERMIT_MAX_TTL = 3600;
    bytes32 constant TYPE_HASH =
        keccak256("Permit(address requester,uint256 expiry,bytes randomPart)");

    bytes32 private immutable _secret;

    /**
     * @dev The user is expected to sign the ciphertext obtained via {requestPermit(requester, nonce, ttl)}
     */
    modifier onlyPermitted(SignedPermit calldata signed) {
        Permit memory permit = abi.decode(
            Sapphire.decrypt(
                _secret,
                bytes32(signed.nonce),
                signed.cipheredPermit,
                ""
            ),
            (Permit)
        );
        if (block.timestamp > permit.expiry) revert PermitExpired();
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(TYPE_HASH, permit))
        );
        address signer = ECDSA.recover(digest, signed.signature);
        if (signer != permit.requester) revert PermitUnauthorized();
        _;
    }

    error TtlTooBig();
    error PermitExpired();
    error PermitUnauthorized();

    constructor() EIP712("SignedPermitChecker", "1") {
        _secret = bytes32(Sapphire.randomBytes(32, ""));
    }

    /**
     * @dev Gasless function to request a permit.
     *
     * @return the permit data, ciphered so the user cannot tamper with expiry timestamp.
     */
    function requestPermit(
        address requester,
        uint nonce,
        uint ttl
    ) external view returns (bytes memory) {
        if (ttl > PERMIT_MAX_TTL) revert TtlTooBig();
        Permit memory permit = Permit(
            requester,
            block.timestamp + ttl,
            Sapphire.randomBytes(128, bytes.concat(bytes20(requester), _secret))
        );
        return
            Sapphire.encrypt(_secret, bytes32(nonce), abi.encode(permit), "");
    }
}
