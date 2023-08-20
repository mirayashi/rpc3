export default [
  {
    inputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'defaultRequestCost',
            type: 'uint256'
          },
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
            name: 'consensusRatioPercent',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'inactivityDuration',
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
    inputs: [],
    name: 'InsufficientStake',
    type: 'error'
  },
  {
    inputs: [],
    name: 'InvalidBatchNonce',
    type: 'error'
  },
  {
    inputs: [],
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
    inputs: [],
    name: 'NextBatchReady',
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
    inputs: [],
    name: 'applyLastContribution',
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
    inputs: [],
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
    inputs: [],
    name: 'getNextHousekeepTimestamp',
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
        name: 'nonce',
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
        name: 'position',
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
        name: 'defaultRequestCost',
        type: 'uint256'
      },
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
        name: 'consensusRatioPercent',
        type: 'uint256'
      },
      {
        internalType: 'uint256',
        name: 'inactivityDuration',
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
    inputs: [],
    name: 'totalContributions',
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
    stateMutability: 'payable',
    type: 'receive'
  }
]
