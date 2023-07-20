// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface BCREST {
    struct Server {
        address addr;
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
        bytes headers;
        string ipfsHash;
        uint sentAt;
        uint ttl;
    }

    struct Response {
        uint requestNonce;
        bytes headers;
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

    event NextBatchReady(string indexed stateIpfsHash);

    event ResponseReceived(uint nonce);

    // Functions called by owner/DAO

    function setRequestMaxTtl(uint maxTtl) external;

    // Functions called by servers

    function serverRegister() external payable;

    function serverUnregister() external;

    function withdrawRewards() external;

    function getCurrentBatch() external view returns (Batch memory);

    function submitBatchResult(BatchResult calldata result) external;

    // Functions called by clients

    function depositCredits() external payable;

    function sendRequest(
        bytes calldata headers,
        uint requestIpfsHash,
        uint ttl
    ) external returns (uint); // request nonce

    function getResponse(uint nonce) external view returns (Response memory);
}
