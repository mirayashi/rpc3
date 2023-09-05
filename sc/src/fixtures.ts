import { ethers } from 'hardhat'
import { RESULT_1, RESULT_2 } from '../src/batchResult'
import { multihash } from 'rpc3-common'
import { registerManyServers, skipBatchesUntilInactive } from '../src/utils'

export async function deploy(globalParamsOverrides?: object) {
  // Contracts are deployed using the first signer/account by default
  const [owner, ...users] = await ethers.getSigners()

  const RPC3 = await ethers.getContractFactory('RPC3')
  const globalParams = {
    minStake: ethers.utils.parseEther('1'),
    consensusMaxDuration: ethers.BigNumber.from(60),
    consensusQuorumPercent: ethers.BigNumber.from(75),
    consensusMajorityPercent: ethers.BigNumber.from(51),
    inactivityThreshold: ethers.BigNumber.from(3),
    ownerRoyaltiesPercent: ethers.BigNumber.from(0),
    slashPercent: ethers.BigNumber.from(2),
    housekeepBaseReward: ethers.BigNumber.from(10),
    housekeepCleanReward: ethers.BigNumber.from(1),
    maxServers: ethers.BigNumber.from(300),
    maxBatchSize: ethers.BigNumber.from(6000),
    contributionPointMaxValue: ethers.utils.parseEther('1'),
    ...globalParamsOverrides
  }
  const stateCid = multihash.parse('QmWBaeu6y1zEcKbsEqCuhuDHPL3W8pZouCPdafMCRCSUWk')
  const contract = await RPC3.deploy(globalParams, stateCid)

  return { contract, globalParams, stateCid, owner, users }
}

export async function deployAndRegisterOwner(globalParamsOverrides?: object) {
  const fixture = await deploy(globalParamsOverrides)
  await fixture.contract.serverRegister({ value: ethers.utils.parseEther('1') })
  return fixture
}

export async function deployAndRegister4Users(globalParamsOverrides?: object) {
  const fixture = await deploy(globalParamsOverrides)
  const {
    contract,
    users: [user1, user2, user3, user4]
  } = fixture
  await contract.connect(user1).serverRegister({ value: ethers.utils.parseEther('1') })
  await contract.connect(user2).serverRegister({ value: ethers.utils.parseEther('2') })
  await contract.connect(user3).serverRegister({ value: ethers.utils.parseEther('4') })
  await contract.connect(user4).serverRegister({ value: ethers.utils.parseEther('8') })
  return { ...fixture }
}

export async function deployAndSubmitOneRequest(globalParamsOverrides?: object) {
  const fixture = await deployAndRegister4Users(globalParamsOverrides)
  const { contract } = fixture
  await contract.sendRequest(multihash.generate('request1'))
  return fixture
}

export async function deployAndReachConsensus(globalParamsOverrides?: object) {
  const fixture = await deployAndSubmitOneRequest(globalParamsOverrides)
  const {
    contract,
    users: [user1, user2, user3]
  } = fixture
  await contract.connect(user1).submitBatchResult(1, RESULT_1)
  await contract.connect(user2).submitBatchResult(1, RESULT_1)
  await contract.connect(user3).submitBatchResult(1, RESULT_2)
  return fixture
}

export async function deployAndPauseContract(globalParamsOverrides?: object) {
  const fixture = await deploy(globalParamsOverrides)
  const { contract } = fixture
  await contract.pause()
  return fixture
}

export async function deployAndMake220UsersHousekeepable(globalParamsOverrides?: object) {
  const fixture = await deploy(globalParamsOverrides)
  const {
    contract,
    globalParams: { inactivityThreshold, consensusMaxDuration }
  } = fixture
  const wallets = await registerManyServers(contract, 220)
  await skipBatchesUntilInactive(
    contract,
    inactivityThreshold.toNumber(),
    consensusMaxDuration.toNumber(),
    wallets[219]
  )
  return fixture
}
