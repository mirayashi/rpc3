import { task } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import { multihash } from '@rpc3/common'
import '@oasisprotocol/sapphire-hardhat'

const globalParamsDefault = {
  minStake: '1000000000000000000',
  consensusMaxDuration: 90,
  consensusQuorumPercent: 85,
  consensusMajorityPercent: 85,
  inactivityThreshold: 10,
  ownerRoyaltiesPercent: 5,
  slashPercent: 4,
  housekeepBaseReward: 20,
  housekeepCleanReward: 2,
  maxServers: 200,
  maxBatchSize: 6000,
  contributionPointMaxValue: '1000000000000000000'
}

task('deploy', 'Deploy the contract')
  .addParam('stateCid', 'IPFS CID of data representing the initial state of the app')
  .addOptionalParam('minStake', 'Mimimum amount to stake (in wei) when registering as a server')
  .addOptionalParam('consensusMaxDuration', 'Maximum duration (in seconds) for a batch to reach consensus')
  .addOptionalParam(
    'consensusQuorumPercent',
    'Minimum % of total registered servers that must submit a result in order to complete a batch'
  )
  .addOptionalParam(
    'consensusMajorityPercent',
    'Minimum % of total submitted results that the majority must reach for a consensus to be considered established'
  )
  .addOptionalParam(
    'inactivityThreshold',
    'A server that has not participated for this number of batches may be auto-unregistered anytime via the housekeeping process'
  )
  .addOptionalParam(
    'ownerRoyaltiesPercent',
    'When funds are added to treasury (via slashing or manual deposit), this % of the amount will be paid to the owner as royalties'
  )
  .addOptionalParam(
    'slashPercent',
    'The % of the amount staked by the server that is confiscated and added to treasury upon unregistration or bad contribution'
  )
  .addOptionalParam(
    'housekeepBaseReward',
    'The guaranteed minimum reward when calling housekeep method, regardless of number of inactive servers processed'
  )
  .addOptionalParam(
    'housekeepCleanReward',
    'Extra bonus reward in addition to base reward for each inactive servers processed through housekeeping'
  )
  .addOptionalParam('maxServers', 'Maximum number of servers that may be registered in the protocol')
  .addOptionalParam('maxBatchSize', 'Maximum number of requests contained in a single batch')
  .addOptionalParam('contributionPointMaxValue', 'Maximum value in wei for a single contribution point')
  .setAction(async (args, hre) => {
    const ethers = hre.ethers
    const RPC3 = await ethers.getContractFactory('RPC3')
    const globalParams = {
      ...globalParamsDefault,
      ...Object.entries(args)
        .filter(([k, v]) => Object.keys(globalParamsDefault).includes(k) && typeof v !== 'undefined')
        .reduce((acc, [k, v]) => Object.assign(acc, { [k]: v }), {})
    }
    const stateCid = multihash.parse(args.stateCid)
    const contract = await RPC3.deploy(globalParams, stateCid)

    const { address } = await contract.deployed()

    console.log(`RPC3 deployed to ${address}`)
  })

task('deploy-pcu', 'Deploy the Private Computation Unit contract').setAction(async (_args, hre) => {
  const ethers = hre.ethers
  const PrivateComputationUnit = await ethers.getContractFactory('PrivateComputationUnit')
  const contract = await PrivateComputationUnit.deploy()
  const { address } = await contract.deployed()
  console.log(`PrivateComputationUnit deployed to ${address}`)
})
