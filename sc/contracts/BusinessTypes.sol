// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

uint constant BATCH_SIZE = 10000;
uint constant INACTIVE_SERVERS_PAGE_SIZE = 200;
uint constant HOUSEKEEP_MAX_SIZE = 10;

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
    IPFSMultihash responseIpfsHash;
    IPFSMultihash finalStateIpfsHash;
}

struct Consensus {
    mapping(bytes32 => BatchResult) resultsByHash;
    mapping(address => bytes32) resultsByServer;
    mapping(bytes32 => uint) countByResult;
    mapping(uint => address) serversWhoParticipated;
    uint startedAt;
    uint numberOfParticipants;
    bytes32 resultWithLargestCount;
}

enum Contribution {
    NEUTRAL,
    REWARD,
    SLASH
}

struct IPFSMultihash {
    bytes32 header;
    bytes32 digest;
}

struct GlobalParams {
    uint defaultRequestCost;
    uint minStake;
    uint consensusMaxDuration;
    uint consensusQuorumPercent;
    uint consensusRatioPercent;
    uint inactivityDuration;
    uint slashPercent;
    uint housekeepBaseReward;
    uint housekeepCleanReward;
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
