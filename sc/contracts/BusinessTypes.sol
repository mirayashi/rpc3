// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

uint constant BATCH_SIZE = 2000;
uint constant MAX_SERVERS = 200;

struct Batch {
    uint nonce;
    string initialStateIpfsHash;
    uint head;
}

struct BatchCoordinates {
    uint batchNonce;
    uint position;
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
    string[] responseIpfsHashes;
}

struct Consensus {
    uint startedAt;
    uint totalServers;
    mapping(address => bytes32) resultsByServer;
    mapping(bytes32 => uint) countByResult;
    mapping(address => uint8) randomBackoffs;
    mapping(uint => address) serversWhoParticipated;
    uint numberOfParticipants;
    bytes32 resultWithLargestCount;
    uint reachedAt;
}

struct GlobalParams {
    uint defaultRequestCost;
    uint minStake;
    uint consensusMaxDuration;
    uint consensusQuorumPercent;
    uint consensusRatioPercent;
    uint inactivityDuration;
    uint slashPercent;
    uint16 housekeepReward;
    uint16 revealReward;
    uint8 randomBackoffMin;
    uint8 randomBackoffMax;
}

struct Request {
    string ipfsHash;
    address author;
}

struct RequestQueue {
    mapping(uint => Request) queue;
    uint head;
    uint tail;
}

struct Response {
    string ipfsHash;
}

struct Server {
    address addr;
    uint stake;
    uint16 contributions;
    uint lastSeen;
    uint nextHousekeepAt;
}

struct RevealedBatchResult {
    bool exists;
    mapping(uint => Response) responses;
}
