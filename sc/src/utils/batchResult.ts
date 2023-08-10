import multihash, { Multihash } from "./multihash"

interface Result {
  nonce: number
  finalStateIpfsHash: Multihash
  responses: Array<Multihash>
}

function batchResult(id: string, nonce: number, count: number = 1): Result {
  const multihashes = [...Array(count).keys()].map(() => multihash.generate(`some response`))
  return {
    nonce,
    finalStateIpfsHash: multihash.generate(id),
    responses: multihashes
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
