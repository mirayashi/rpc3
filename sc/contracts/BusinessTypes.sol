// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

uint constant BATCH_SIZE = 6000;

struct Batch {
    uint nonce;
    string initialStateIpfsHash;
    uint head;
}

struct BatchView {
    uint nonce;
    string initialStateIpfsHash;
    Request[] requests;
    uint expiresAt;
}

struct BatchRange {
    uint start;
    uint end;
}

struct BatchResult {
    uint nonce;
    string finalStateIpfsHash;
    Response[] responses;
}

struct Consensus {
    uint startedAt;
    mapping(address => bytes32) resultsByServer;
    mapping(bytes32 => uint) countByResult;
    address[] serversWhoParticipated;
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
    uint housekeepReward;
    uint slashPercent;
}

struct Request {
    uint nonce;
    string ipfsHash;
    address author;
}

struct RequestQueue {
    mapping(uint => Request) queue;
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
    uint nextHousekeepAt;
}
