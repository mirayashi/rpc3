// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import "./CipherStrategy.sol";

contract SignedPermitChecker is EIP712, CipherEnabled {
    struct Permit {
        address requester;
        uint expiry;
        bytes32 randomPart;
    }

    struct CipheredPermit {
        uint nonce;
        bytes ciphertext;
    }

    struct SignedPermit {
        CipheredPermit cipheredPermit;
        bytes signature;
    }

    uint constant PERMIT_MAX_TTL = 3600;
    bytes32 constant TYPE_HASH =
        keccak256("CipheredPermit(uint256 nonce,bytes ciphertext)");

    bytes32 private immutable _secret;

    /**
     * @dev The user is expected to sign the ciphertext obtained via {requestPermit(requester, nonce, ttl)}
     */
    modifier onlyPermitted(SignedPermit calldata sp) {
        Permit memory permit = abi.decode(
            cipherStrategy.decrypt(
                _secret,
                sp.cipheredPermit.nonce,
                sp.cipheredPermit.ciphertext
            ),
            (Permit)
        );
        if (block.timestamp > permit.expiry) {
            revert PermitExpired();
        }
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    TYPE_HASH,
                    sp.cipheredPermit.nonce,
                    keccak256(sp.cipheredPermit.ciphertext)
                )
            )
        );
        address signer = ECDSA.recover(digest, sp.signature);
        if (signer != msg.sender || signer != permit.requester) {
            revert PermitUnauthorized();
        }
        _;
    }

    error TtlTooBig();
    error PermitExpired();
    error PermitUnauthorized();

    constructor() EIP712("SignedPermitChecker", "1") {
        _secret = bytes32(cipherStrategy.randomBytes32(0));
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
    ) external view returns (CipheredPermit memory) {
        if (ttl > PERMIT_MAX_TTL) revert TtlTooBig();
        Permit memory permit = Permit(
            requester,
            block.timestamp + ttl,
            cipherStrategy.randomBytes32(
                uint(keccak256(bytes.concat(bytes20(requester), _secret)))
            )
        );
        bytes memory ciphertext = cipherStrategy.encrypt(
            _secret,
            nonce,
            abi.encode(permit)
        );
        return CipheredPermit(nonce, ciphertext);
    }
}
