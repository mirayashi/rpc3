import { ethers } from 'hardhat'
import type { BigNumber } from 'ethers'

export async function deployPCU() {
  const [owner, ...users] = await ethers.getSigners()

  const PCU = await ethers.getContractFactory('PrivateComputationUnitTest')
  const contract = await PCU.deploy()

  return { contract, owner, users }
}

export async function deployPCUAndCreateKeys() {
  const fixture = await deployPCU()
  const {
    contract,
    users: [user1]
  } = fixture
  // Create simple key
  const tx = await contract.createKey()
  const receipt = await tx.wait()
  const event = receipt.events?.find(ev => ev.event === 'KeyCreated')
  if (event?.args === undefined) throw new Error('assertion failed')
  const keyNonce: BigNumber = event.args[1]
  // Create shared key
  const tx2 = await contract.createSharedKey([user1.address])
  const receipt2 = await tx2.wait()
  const event2 = receipt2.events?.find(ev => ev.event === 'KeyCreated')
  if (event2?.args === undefined) throw new Error('assertion failed')
  const sharedKeyNonce: BigNumber = event2.args[1]
  return { ...fixture, keyNonce, sharedKeyNonce }
}
