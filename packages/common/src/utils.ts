import { type TypedDataDomain, ethers, BigNumberish } from 'ethers'
import { SignedPermitChecker } from '../generated/contracts/common/SignedPermitChecker'
import { TypedDataSigner } from './types'

export async function asyncIterableToString(input: AsyncIterable<Uint8Array>) {
  const decoder = new TextDecoder('utf8')
  let result = ''
  for await (const buf of input) {
    result += decoder.decode(buf, { stream: true })
  }
  return result + decoder.decode()
}

export async function nextBlock(provider: ethers.providers.Provider): Promise<void> {
  return new Promise(resolve => provider.once('block', resolve))
}

export function buf2HexString(buf: Uint8Array): string {
  return `0x${Buffer.from(buf).toString('hex')}`
}

export function hexString2Buf(str: string): Buffer {
  return Buffer.from(str.substring(2), 'hex')
}

export function bigInt2Buf32(n: bigint): Buffer {
  const buf = Buffer.alloc(32)
  buf.writeBigUInt64LE(n)
  return buf.reverse()
}

export function buf322BigInt(buf: Uint8Array): bigint {
  return Buffer.from(buf).reverse().readBigUInt64LE()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toTypedDataDomain(input: Record<string, any>): TypedDataDomain {
  const { name, version, chainId, verifyingContract } = input
  return { name, version, chainId, verifyingContract }
}

const types = {
  CipheredPermit: [
    { name: 'nonce', type: 'uint256' },
    { name: 'ciphertext', type: 'bytes' }
  ]
}

export async function createPermit(contract: SignedPermitChecker, user: TypedDataSigner, nonce: BigNumberish = 0) {
  const cipheredPermit = await contract.requestPermit(user.address, nonce, 3600)
  const signature = await user._signTypedData(toTypedDataDomain(await contract.eip712Domain()), types, cipheredPermit)
  return { cipheredPermit, signature }
}
