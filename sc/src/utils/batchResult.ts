import multihash, { Multihash } from "./multihash"

interface Result {
  finalStateIpfsHash: Multihash
  responseIpfsHash: Multihash
}

function generate(id: string): Result {
  return {
    finalStateIpfsHash: multihash.generate(`final state for ${id}`),
    responseIpfsHash: multihash.generate(`some response for ${id}`)
  }
}

export const RESULT_1 = generate("1")
export const RESULT_2 = generate("2")
export const RESULT_3 = generate("3")
