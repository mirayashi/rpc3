import { expect } from "chai"

async function expectThatCurrentBatchHas(
  contract: any,
  {
    nonce,
    stateIpfsHash,
    requests,
    sizeOf
  }: {
    nonce?: number
    stateIpfsHash?: string
    requests?: Array<any>
    sizeOf?: number
  }
) {
  const batchView = await contract.getCurrentBatch()
  if (nonce) {
    expect(batchView.nonce).to.equal(nonce)
  }
  if (stateIpfsHash) {
    expect(batchView.initialStateIpfsHash).to.equal(stateIpfsHash)
  }
  if (sizeOf) {
    expect(batchView.requests).to.have.lengthOf(sizeOf)
  }
  if (requests) {
    expect(batchView.requests).to.deep.equal(requests)
  }
}

export default expectThatCurrentBatchHas
