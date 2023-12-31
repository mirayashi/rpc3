import { expect } from 'chai'
import { RPC3, RequestStruct } from '../typechain-types/contracts/RPC3/RPC3'
import { Multihash, type TypedDataSigner } from '@rpc3/common'
import { WithPermit } from './utils'

async function expectThatCurrentBatchHas(
  contract: RPC3,
  caller: WithPermit<TypedDataSigner>,
  {
    nonce,
    stateCid,
    requests,
    sizeOf,
    expiresAt
  }: {
    nonce?: number
    stateCid?: Multihash
    requests?: Array<RequestStruct>
    sizeOf?: number
    expiresAt?: number
  }
) {
  const batchView = await contract.connect(caller).getCurrentBatch(caller.permit, 0)
  if (nonce) {
    expect(batchView.nonce).to.equal(nonce)
  }
  if (stateCid) {
    expect(batchView.initialStateCid).to.deep.equal(Object.assign(Object.values(stateCid), stateCid))
  }
  if (sizeOf) {
    expect(batchView.requests).to.have.lengthOf(sizeOf)
  }
  if (requests) {
    expect(batchView.requests).to.deep.equal(requests)
  }
  if (expiresAt) {
    expect(batchView.expiresAt).to.equal(expiresAt)
  }
}

export default expectThatCurrentBatchHas
