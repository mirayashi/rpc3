import { time } from '@nomicfoundation/hardhat-network-helpers'
import { ethers } from 'hardhat'
import type { Signer } from 'ethers'
import type { RPC3, SignedPermitChecker } from '../typechain-types'
import { multihash, utils, type TypedDataSigner } from '@rpc3/common'

export function toStruct<T extends object>(obj: T): T {
  return Object.assign(Object.values(obj), obj)
}

export async function registerManyServers(contract: RPC3, count: number) {
  const wallets = await ethers.getSigners()
  const registered: TypedDataSigner[] = []
  for (let i = 0; i < count && i < wallets.length; i++) {
    const wallet = wallets[i]
    await contract.connect(wallet).serverRegister({ value: ethers.utils.parseEther('1') })
    process.stdout.write(`\r        Registered server ${i + 1}/${count}`)
    registered.push(wallet)
    await time.increase(604800)
  }
  console.log()
  return registered
}

export async function skipBatchesUntilInactive(
  contract: RPC3,
  inactivityThreshold: number,
  consensusMaxDuration: number,
  skipSigner: Signer
) {
  for (let i = 0; i <= inactivityThreshold; i++) {
    await contract.sendRequest(multihash.generate('request1'))
    await time.increase(consensusMaxDuration)
    await contract.connect(skipSigner).skipBatchIfConsensusExpired()
  }
}

export type WithPermit<T> = T & {
  permit: {
    cipheredPermit: SignedPermitChecker.CipheredPermitStructOutput
    signature: string
  }
}

export async function attachPermitForEach(
  contract: SignedPermitChecker,
  wallets: TypedDataSigner[]
): Promise<WithPermit<TypedDataSigner>[]> {
  const walletsWithPermits: WithPermit<TypedDataSigner>[] = []
  for (const wallet of wallets) {
    walletsWithPermits.push(Object.assign(wallet, { permit: await utils.createPermit(contract, wallet) }))
  }
  return walletsWithPermits
}
