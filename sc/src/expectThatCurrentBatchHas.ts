import { expect } from "chai"
import { Contract } from "ethers"
import { RequestStruct } from "../typechain-types/REST3App"
import { Multihash } from "./multihash"

async function expectThatCurrentBatchHas(
  contract: Contract,
  {
    nonce,
    stateIpfsHash,
    requests,
    sizeOf
  }: {
    nonce?: number
    stateIpfsHash?: Multihash
    requests?: Array<RequestStruct>
    sizeOf?: number
  }
) {
  const batchView = await contract.getCurrentBatch(0)
  if (nonce) {
    expect(batchView.nonce).to.equal(nonce)
  }
  if (stateIpfsHash) {
    expect(batchView.initialStateIpfsHash).to.deep.equal(Object.assign(Object.values(stateIpfsHash), stateIpfsHash))
  }
  if (sizeOf) {
    expect(batchView.requests).to.have.lengthOf(sizeOf)
  }
  if (requests) {
    expect(batchView.requests).to.deep.equal(requests)
  }
}

export default expectThatCurrentBatchHas
