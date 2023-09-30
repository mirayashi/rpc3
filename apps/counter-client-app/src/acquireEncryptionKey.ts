import { PrivateComputationUnit, utils } from '@rpc3/common'
import { BigNumber } from 'ethers'

export default async function acquireEncryptionKey(pcu: PrivateComputationUnit): Promise<BigNumber> {
  const tx = await pcu.createKey()
  const receipt = await tx.wait()
  const keyNonce = receipt.events?.find(({ event }) => event === 'KeyCreated')?.args?.[1]
  if (keyNonce instanceof BigNumber) {
    await utils.nextBlock(pcu.provider)
    return keyNonce
  }
  return Promise.reject('unexpected data from key creation')
}
