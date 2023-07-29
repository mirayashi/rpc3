// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

uint constant BATCH_SIZE = 6000;

struct Batch {
    string initialStateIpfsHash;
    Request[BATCH_SIZE] requests;
}

struct BatchResult {
    string initialStateIpfsHash;
    string finalStateIpfsHash;
    Response[BATCH_SIZE] responses;
}

struct Consensus {
    uint startedAt;
    mapping(address => bytes32) resultsByServer;
    mapping(bytes32 => uint) countByResult;
    uint numberOfParticipants;
    bytes32 resultWithLargestCount;
}

struct GlobalParams {
    uint defaultRequestCost;
    uint requestMaxTtl;
    uint minStake;
    uint consensusMinDuration;
    uint consensusMaxDuration;
    uint consensusQuorumPercent;
    uint consensusRatioPercent;
    uint maxInactivityFlags;
}

struct QueuedRequest {
    uint nonce;
    string ipfsHash;
    uint sentAt;
}

struct Request {
    uint nonce;
    string ipfsHash;
    uint currentTime;
}

struct RequestQueue {
    mapping(uint => QueuedRequest) queue;
    uint head;
    uint tail;
}

struct Response {
    uint requestNonce;
    string ipfsHash;
}

struct Server {
    address addr;
    uint stake;
    uint contributions;
    uint inactivityFlags;
}
