// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

uint constant BATCH_SIZE = 2000;
uint constant MAX_SERVERS = 200;

struct Batch {
    uint nonce;
    uint head;
    IPFSMultihash initialStateIpfsHash;
}

struct BatchCoordinates {
    uint batchNonce;
    uint position;
}

struct BatchView {
    uint nonce;
    uint expiresAt;
    Request[] requests;
    IPFSMultihash initialStateIpfsHash;
}

struct BatchRange {
    uint start;
    uint end;
}

struct BatchResult {
    uint nonce;
    IPFSMultihash finalStateIpfsHash;
    IPFSMultihash[] responses;
}

struct Consensus {
    uint startedAt;
    mapping(address => bytes32) resultsByServer;
    mapping(bytes32 => uint) countByResult;
    mapping(address => uint) randomBackoffs;
    mapping(uint => address) serversWhoParticipated;
    uint numberOfParticipants;
    bytes32 resultWithLargestCount;
    uint reachedAt;
}

struct IPFSMultihash {
    bytes32 digest;
    uint8 hashFunction;
    uint8 size;
}

struct GlobalParams {
    uint defaultRequestCost;
    uint minStake;
    uint consensusMaxDuration;
    uint consensusQuorumPercent;
    uint consensusRatioPercent;
    uint inactivityDuration;
    uint slashPercent;
    uint housekeepReward;
    uint revealReward;
    uint randomBackoffMin;
    uint randomBackoffMax;
}

struct Request {
    address author;
    IPFSMultihash ipfsHash;
}

struct RequestQueue {
    mapping(uint => Request) queue;
    uint head;
    uint tail;
}

struct Response {
    IPFSMultihash ipfsHash;
}

struct Server {
    address addr;
    uint stake;
    uint contributions;
    uint lastSeen;
    uint nextHousekeepAt;
}

struct RevealedBatchResult {
    bool exists;
    mapping(uint => Response) responses;
}
