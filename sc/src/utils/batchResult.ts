import multihash, { Multihash } from "./multihash"

interface Result {
  nonce: number
  finalStateIpfsHash: Multihash
  encodedResponses: Uint8Array
}

function batchResult(id: string, nonce: number, count: number = 1): Result {
  return {
    nonce,
    finalStateIpfsHash: multihash.generate(id),
    encodedResponses: [...Array(count).keys()]
      .map(i => multihash.pack(multihash.generate(`some response ${i}`)))
      .reduce((buf, hash) => Buffer.concat([buf, hash]), Buffer.alloc(0))
  }
}

export function batchResult1(nonce: number, count: number = 1): Result {
  return batchResult("1", nonce, count)
}

export function batchResult2(nonce: number, count: number = 1): Result {
  return batchResult("2", nonce, count)
}

export function batchResult3(nonce: number, count: number = 1): Result {
  return batchResult("3", nonce, count)
}
