// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface REST3 {
    struct Server {
        address addr;
        uint stake;
        uint contributions;
    }

    struct Request {
        uint nonce;
        bytes headers;
        string ipfsHash;
        uint randomSeed;
        uint currentTime;
    }

    struct QueuedRequest {
        uint nonce;
        string ipfsHash;
        uint sentAt;
        uint ttl;
    }

    struct Response {
        uint requestNonce;
        string ipfsHash;
    }

    struct Batch {
        string initialStateIpfsHash;
        Request[] requests;
    }

    struct BatchResult {
        string initialStateIpfsHash;
        string finalStateIpfsHash;
        Response[] responses;
    }

    // Events

    event NextBatchReady(string indexed stateIpfsHash);

    event ResponseReceived(uint nonce);

    // Errors

    error ServerAlreadyRegistered();

    error ServerNotRegistered();

    error InsufficientStake();

    // Functions called by servers

    function serverRegister() external payable;

    function serverUnregister() external;

    function withdrawRewards() external;

    function getCurrentBatch() external view returns (Batch memory);

    function submitBatchResult(BatchResult calldata result) external;

    // Functions called by clients

    function sendRequest(
        string calldata requestIpfsHash,
        uint ttl
    ) external returns (uint); // request nonce

    function getResponse(uint nonce) external view returns (Response memory);
}
