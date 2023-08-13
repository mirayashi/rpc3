import { time } from "@nomicfoundation/hardhat-network-helpers"
import { ethers } from "hardhat"
import { RESULT_1, RESULT_2 } from "../src/batchResult"
import multihash from "../src/multihash"

export async function deploy(globalParamsOverrides?: object) {
  // Contracts are deployed using the first signer/account by default
  const [owner, ...users] = await ethers.getSigners()

  const REST3App = await ethers.getContractFactory("REST3App")
  const globalParams = {
    minStake: ethers.utils.parseEther("1"),
    consensusMaxDuration: ethers.BigNumber.from(60),
    consensusQuorumPercent: ethers.BigNumber.from(75),
    consensusRatioPercent: ethers.BigNumber.from(51),
    inactivityDuration: ethers.BigNumber.from(3600),
    ownerRoyaltiesPercent: ethers.BigNumber.from(0),
    slashPercent: ethers.BigNumber.from(2),
    housekeepBaseReward: ethers.BigNumber.from(10),
    housekeepCleanReward: ethers.BigNumber.from(1),
    maxServers: ethers.BigNumber.from(300),
    maxBatchSize: ethers.BigNumber.from(6000),
    ...globalParamsOverrides
  }
  const stateIpfsHash = multihash.parse("QmWBaeu6y1zEcKbsEqCuhuDHPL3W8pZouCPdafMCRCSUWk")
  const contract = await REST3App.deploy(globalParams, stateIpfsHash)

  return { contract, globalParams, stateIpfsHash, owner, users }
}

export async function deployAndRegisterOwner() {
  const fixture = await deploy()
  await fixture.contract.serverRegister({ value: ethers.utils.parseEther("1") })
  return fixture
}

export async function deployAndRegister4Users(globalParamsOverrides?: object) {
  const fixture = await deploy(globalParamsOverrides)
  const {
    contract,
    users: [user1, user2, user3, user4]
  } = fixture
  const usersLastSeen = []
  await contract.connect(user1).serverRegister({ value: ethers.utils.parseEther("1") })
  usersLastSeen.push(await time.latest())
  await contract.connect(user2).serverRegister({ value: ethers.utils.parseEther("2") })
  usersLastSeen.push(await time.latest())
  await contract.connect(user3).serverRegister({ value: ethers.utils.parseEther("4") })
  usersLastSeen.push(await time.latest())
  await contract.connect(user4).serverRegister({ value: ethers.utils.parseEther("8") })
  usersLastSeen.push(await time.latest())
  return { ...fixture, usersLastSeen, usersRegisteredAt: usersLastSeen.slice() }
}

export async function deployAndSubmitOneRequest(globalParamsOverrides?: object) {
  const fixture = await deployAndRegister4Users(globalParamsOverrides)
  const { contract } = fixture
  await contract.sendRequest(multihash.generate("request1"))
  return fixture
}

export async function deployAndReachConsensus(globalParamsOverrides?: object) {
  const fixture = await deployAndSubmitOneRequest(globalParamsOverrides)
  const {
    contract,
    users: [user1, user2, user3],
    usersLastSeen
  } = fixture
  await contract.connect(user1).submitBatchResult(1, RESULT_1)
  usersLastSeen[0] = await time.latest()
  await contract.connect(user2).submitBatchResult(1, RESULT_1)
  usersLastSeen[1] = await time.latest()
  await contract.connect(user3).submitBatchResult(1, RESULT_2)
  usersLastSeen[2] = await time.latest()
  return fixture
}

export async function deployAndEnableMaintenanceMode() {
  const fixture = await deploy()
  const { contract } = fixture
  await contract.setMaintenanceMode(true)
  return fixture
}
