// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

uint constant BATCH_SIZE = 6000;

struct Batch {
    string initialStateIpfsHash;
    Request[BATCH_SIZE] requests;
}

struct BatchView {
    string initialStateIpfsHash;
    Request[] requests;
}

struct BatchResult {
    string initialStateIpfsHash;
    string finalStateIpfsHash;
    Response[] responses;
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
    uint consensusMaxDuration;
    uint consensusQuorumPercent;
    uint consensusRatioPercent;
    uint inactivityDuration;
}

struct QueuedRequest {
    uint nonce;
    string ipfsHash;
    uint sentAt;
    address author;
}

struct Request {
    uint nonce;
    string ipfsHash;
    uint currentTime;
    address author;
}

struct RequestQueue {
    mapping(uint => QueuedRequest) queue;
    uint head;
    uint tail;
}

struct Response {
    uint requestNonce;
    string ipfsHash;
    address author;
}

struct Server {
    address addr;
    uint stake;
    uint contributions;
    uint lastSeen;
}
