import { BigNumber, Wallet, Signer, TypedDataDomain, TypedDataField } from 'ethers'
// @ts-expect-error cjs
import * as sapphire from '@oasisprotocol/sapphire-paratime'

export interface TypedDataSigner extends Signer {
  readonly address: string
  _signTypedData(
    domain: TypedDataDomain,
    types: Record<string, Array<TypedDataField>>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: Record<string, any>
  ): Promise<string>
}

export type CipheredPermit = {
  nonce: BigNumber
  ciphertext: string
}

export type Permit = {
  cipheredPermit: CipheredPermit
  signature: string
}

export type SapphireWallet = Wallet & sapphire.SapphireAnnex
