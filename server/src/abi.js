export default [
  {
    inputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'minStake',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'consensusMaxDuration',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'consensusQuorumPercent',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'consensusMajorityPercent',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'inactivityDuration',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'ownerRoyaltiesPercent',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'slashPercent',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'housekeepBaseReward',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'housekeepCleanReward',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'maxServers',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'maxBatchSize',
            type: 'uint256'
          }
        ],
        internalType: 'struct GlobalParams',
        name: 'globalParams_',
        type: 'tuple'
      },
      {
        components: [
          {
            internalType: 'bytes32',
            name: 'header',
            type: 'bytes32'
          },
          {
            internalType: 'bytes32',
            name: 'digest',
            type: 'bytes32'
          }
        ],
        internalType: 'struct IPFSMultihash',
        name: 'stateIpfsHash',
        type: 'tuple'
      }
    ],
    stateMutability: 'nonpayable',
    type: 'constructor'
  },
  {
    inputs: [],
    name: 'BatchInProgress',
    type: 'error'
  },
  {
    inputs: [],
    name: 'ConsensusNotActive',
    type: 'error'
  },
  {
    inputs: [],
    name: 'EmptyBatch',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'nextHousekeepTimestamp',
        type: 'uint256'
      }
    ],
    name: 'HousekeepCooldown',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'expectedMinAmount',
        type: 'uint256'
      }
    ],
    name: 'InsufficientStake',
    type: 'error'
  },
  {
    inputs: [],
    name: 'InvalidBatchNonce',
    type: 'error'
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: 'string',
            name: 'field',
            type: 'string'
          },
          {
            internalType: 'string',
            name: 'reason',
            type: 'string'
          }
        ],
        internalType: 'struct GlobalParamsValidator.Violation[]',
        name: 'violations',
        type: 'tuple[]'
      }
    ],
    name: 'InvalidGlobalParams',
    type: 'error'
  },
  {
    inputs: [],
    name: 'InvalidRequestNonce',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'maxPage',
        type: 'uint256'
      }
    ],
    name: 'MaxPageExceeded',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'limit',
        type: 'uint256'
      }
    ],
    name: 'MaxServersReached',
    type: 'error'
  },
  {
    inputs: [],
    name: 'RequestAuthorMismatch',
    type: 'error'
  },
  {
    inputs: [],
    name: 'ResponseNotAvailable',
    type: 'error'
  },
  {
    inputs: [],
    name: 'ResultAlreadySubmitted',
    type: 'error'
  },
  {
    inputs: [],
    name: 'ServerAlreadyRegistered',
    type: 'error'
  },
  {
    inputs: [],
    name: 'ServerNotRegistered',
    type: 'error'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256'
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'royalties',
        type: 'uint256'
      }
    ],
    name: 'AddedToTreasury',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'batchNonce',
        type: 'uint256'
      }
    ],
    name: 'BatchCompleted',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'batchNonce',
        type: 'uint256'
      }
    ],
    name: 'BatchFailed',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [],
    name: 'BatchResultHashSubmitted',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'minStake',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'consensusMaxDuration',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'consensusQuorumPercent',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'consensusMajorityPercent',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'inactivityDuration',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'ownerRoyaltiesPercent',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'slashPercent',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'housekeepBaseReward',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'housekeepCleanReward',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'maxServers',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'maxBatchSize',
            type: 'uint256'
          }
        ],
        indexed: false,
        internalType: 'struct GlobalParams',
        name: 'newValue',
        type: 'tuple'
      }
    ],
    name: 'GlobalParamsUpdated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint256',
        name: 'cleanCount',
        type: 'uint256'
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'nextHousekeepTimestamp',
        type: 'uint256'
      }
    ],
    name: 'HousekeepSuccess',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'batchNonce',
        type: 'uint256'
      }
    ],
    name: 'NextBatchReady',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'previousOwner',
        type: 'address'
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'newOwner',
        type: 'address'
      }
    ],
    name: 'OwnershipTransferred',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'account',
        type: 'address'
      }
    ],
    name: 'Paused',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'requestNonce',
        type: 'uint256'
      }
    ],
    name: 'RequestSubmitted',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'addr',
        type: 'address'
      }
    ],
    name: 'ServerRegistered',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'addr',
        type: 'address'
      }
    ],
    name: 'ServerUnregistered',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'account',
        type: 'address'
      }
    ],
    name: 'Unpaused',
    type: 'event'
  },
  {
    inputs: [],
    name: 'amIRegistered',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'applyPendingContribution',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool'
      }
    ],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'claimRewards',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'donateToTreasury',
    outputs: [],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'estimateClaimableRewards',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'page',
        type: 'uint256'
      }
    ],
    name: 'getCurrentBatch',
    outputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'nonce',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'page',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'maxPage',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'expiresAt',
            type: 'uint256'
          },
          {
            components: [
              {
                internalType: 'address',
                name: 'author',
                type: 'address'
              },
              {
                components: [
                  {
                    internalType: 'bytes32',
                    name: 'header',
                    type: 'bytes32'
                  },
                  {
                    internalType: 'bytes32',
                    name: 'digest',
                    type: 'bytes32'
                  }
                ],
                internalType: 'struct IPFSMultihash',
                name: 'ipfsHash',
                type: 'tuple'
              }
            ],
            internalType: 'struct Request[]',
            name: 'requests',
            type: 'tuple[]'
          },
          {
            components: [
              {
                internalType: 'bytes32',
                name: 'header',
                type: 'bytes32'
              },
              {
                internalType: 'bytes32',
                name: 'digest',
                type: 'bytes32'
              }
            ],
            internalType: 'struct IPFSMultihash',
            name: 'initialStateIpfsHash',
            type: 'tuple'
          }
        ],
        internalType: 'struct BatchView',
        name: '',
        type: 'tuple'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'page',
        type: 'uint256'
      }
    ],
    name: 'getInactiveServers',
    outputs: [
      {
        internalType: 'address[]',
        name: '',
        type: 'address[]'
      },
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'requestNonce',
        type: 'uint256'
      }
    ],
    name: 'getResponse',
    outputs: [
      {
        components: [
          {
            internalType: 'bytes32',
            name: 'header',
            type: 'bytes32'
          },
          {
            internalType: 'bytes32',
            name: 'digest',
            type: 'bytes32'
          }
        ],
        internalType: 'struct IPFSMultihash',
        name: '',
        type: 'tuple'
      },
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getServerCount',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getServerData',
    outputs: [
      {
        components: [
          {
            internalType: 'address',
            name: 'addr',
            type: 'address'
          },
          {
            internalType: 'uint256',
            name: 'stake',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'contributions',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'lastSeen',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'nextHousekeepAt',
            type: 'uint256'
          }
        ],
        internalType: 'struct Server',
        name: '',
        type: 'tuple'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getStakeRequirement',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'globalParams',
    outputs: [
      {
        internalType: 'uint256',
        name: 'minStake',
        type: 'uint256'
      },
      {
        internalType: 'uint256',
        name: 'consensusMaxDuration',
        type: 'uint256'
      },
      {
        internalType: 'uint256',
        name: 'consensusQuorumPercent',
        type: 'uint256'
      },
      {
        internalType: 'uint256',
        name: 'consensusMajorityPercent',
        type: 'uint256'
      },
      {
        internalType: 'uint256',
        name: 'inactivityDuration',
        type: 'uint256'
      },
      {
        internalType: 'uint256',
        name: 'ownerRoyaltiesPercent',
        type: 'uint256'
      },
      {
        internalType: 'uint256',
        name: 'slashPercent',
        type: 'uint256'
      },
      {
        internalType: 'uint256',
        name: 'housekeepBaseReward',
        type: 'uint256'
      },
      {
        internalType: 'uint256',
        name: 'housekeepCleanReward',
        type: 'uint256'
      },
      {
        internalType: 'uint256',
        name: 'maxServers',
        type: 'uint256'
      },
      {
        internalType: 'uint256',
        name: 'maxBatchSize',
        type: 'uint256'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address[]',
        name: 'inactiveServers',
        type: 'address[]'
      }
    ],
    name: 'housekeepInactive',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'pause',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'paused',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'dest',
        type: 'address'
      }
    ],
    name: 'payments',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: 'bytes32',
            name: 'header',
            type: 'bytes32'
          },
          {
            internalType: 'bytes32',
            name: 'digest',
            type: 'bytes32'
          }
        ],
        internalType: 'struct IPFSMultihash',
        name: 'requestIpfsHash',
        type: 'tuple'
      }
    ],
    name: 'sendRequest',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'serverRegister',
    outputs: [],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'serverUnregister',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'minStake',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'consensusMaxDuration',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'consensusQuorumPercent',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'consensusMajorityPercent',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'inactivityDuration',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'ownerRoyaltiesPercent',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'slashPercent',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'housekeepBaseReward',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'housekeepCleanReward',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'maxServers',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'maxBatchSize',
            type: 'uint256'
          }
        ],
        internalType: 'struct GlobalParams',
        name: 'globalParams_',
        type: 'tuple'
      }
    ],
    name: 'setGlobalParams',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'skipBatchIfConsensusExpired',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'batchNonce',
        type: 'uint256'
      },
      {
        components: [
          {
            components: [
              {
                internalType: 'bytes32',
                name: 'header',
                type: 'bytes32'
              },
              {
                internalType: 'bytes32',
                name: 'digest',
                type: 'bytes32'
              }
            ],
            internalType: 'struct IPFSMultihash',
            name: 'responseIpfsHash',
            type: 'tuple'
          },
          {
            components: [
              {
                internalType: 'bytes32',
                name: 'header',
                type: 'bytes32'
              },
              {
                internalType: 'bytes32',
                name: 'digest',
                type: 'bytes32'
              }
            ],
            internalType: 'struct IPFSMultihash',
            name: 'finalStateIpfsHash',
            type: 'tuple'
          }
        ],
        internalType: 'struct BatchResult',
        name: 'result',
        type: 'tuple'
      }
    ],
    name: 'submitBatchResult',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'newOwner',
        type: 'address'
      }
    ],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'treasury',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'unpause',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address payable',
        name: 'payee',
        type: 'address'
      }
    ],
    name: 'withdrawPayments',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    stateMutability: 'payable',
    type: 'receive'
  }
]
