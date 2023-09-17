import { BigNumber, Signer, TypedDataDomain, TypedDataField } from 'ethers'

export type Request = {
  count: number
}

export type Response = {
  status: string
  newCount: number
}

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
