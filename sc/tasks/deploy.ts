import { task } from "hardhat/config"
import "@nomicfoundation/hardhat-toolbox"
import multihash from "../src/multihash"
import "@oasisprotocol/sapphire-hardhat"

const globalParamsDefault = {
  minStake: "1000000000000000000",
  consensusMaxDuration: 60,
  consensusQuorumPercent: 85,
  consensusMajorityPercent: 85,
  inactivityDuration: 3600,
  ownerRoyaltiesPercent: 5,
  slashPercent: 4,
  housekeepBaseReward: 20,
  housekeepCleanReward: 2,
  maxServers: 200,
  maxBatchSize: 6000
}

task("deploy", "Deploy the contract")
  .addParam("stateIpfsHash", "IPFS hash of data representing the initial state of the app")
  .addOptionalParam("minStake", "Mimimum amount to stake (in wei) when registering as a server")
  .addOptionalParam("consensusMaxDuration", "Maximum duration (in seconds) for a batch to reach consensus")
  .addOptionalParam(
    "consensusQuorumPercent",
    "Minimum % of total registered servers that must submit a result in order to complete a batch"
  )
  .addOptionalParam(
    "consensusMajorityPercent",
    "Minimum % of total submitted results that the majority must reach for a consensus to be considered established"
  )
  .addOptionalParam(
    "inactivityDuration",
    "A server that is inactive for more than this value (in seconds) may be auto-unregistered anytime via the housekeeping process"
  )
  .addOptionalParam(
    "ownerRoyaltiesPercent",
    "When funds are added to treasury (via slashing or manual deposit), this % of the amount will be paid to the owner as royalties"
  )
  .addOptionalParam(
    "slashPercent",
    "The % of the amount staked by the server that is confiscated and added to treasury upon unregistration or bad contribution"
  )
  .addOptionalParam(
    "housekeepBaseReward",
    "The guaranteed minimum reward when calling housekeep method, regardless of number of inactive servers processed"
  )
  .addOptionalParam(
    "housekeepCleanReward",
    "Extra bonus reward in addition to base reward for each inactive servers processed through housekeeping"
  )
  .addOptionalParam("maxServers", "Maximum number of servers that may be registered in the protocol")
  .addOptionalParam("maxBatchSize", "Maximum number of requests contained in a single batch")
  .setAction(async (args, hre) => {
    const ethers = hre.ethers
    const REST3App = await ethers.getContractFactory("REST3App")
    const globalParams = {
      ...globalParamsDefault,
      ...Object.entries(args)
        .filter(([k, v]) => Object.keys(globalParamsDefault).includes(k) && typeof v !== "undefined")
        .reduce((acc, [k, v]) => Object.assign(acc, { [k]: v }), {})
    }
    const stateIpfsHash = multihash.generate(args.stateIpfsHash)
    const contract = await REST3App.deploy(globalParams, stateIpfsHash)

    await contract.deployed()

    console.log(`REST3App deployed to ${contract.address}`)
  })
