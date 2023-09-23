import { multihash, Multihash } from '@rpc3/common'

interface Result {
  finalStateCid: Multihash
  responseCid: Multihash
}

function generate(id: string): Result {
  return {
    finalStateCid: multihash.generate(`final state for ${id}`),
    responseCid: multihash.generate(`some response for ${id}`)
  }
}

export const RESULT_1 = generate('1')
export const RESULT_2 = generate('2')
export const RESULT_3 = generate('3')
