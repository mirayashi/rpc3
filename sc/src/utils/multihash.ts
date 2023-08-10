// https://github.com/saurfang/ipfs-multihash-on-solidity/blob/master/src/multihash.js
import bs58 from "bs58"
import { createHash } from "crypto"

/**
 * @typedef {Object} Multihash
 * @property {string} digest The digest output of hash function in hex with prepended '0x'
 * @property {number} hashFunction The hash function code for the function used
 * @property {number} size The length of digest
 */
export interface Multihash {
  digest: string
  hashFunction: number
  size: number
}

/**
 * Partition multihash string into object representing multihash
 *
 * @param {string} multihash A base58 encoded multihash string
 * @returns {Multihash}
 */
function parse(multihash: string): Multihash {
  const decoded = bs58.decode(multihash)

  return {
    digest: `0x${Buffer.from(decoded.slice(2)).toString("hex")}`,
    hashFunction: decoded[0],
    size: decoded[1]
  }
}

/**
 * Encode a multihash structure into base58 encoded multihash string
 *
 * @param {Multihash} multihash
 * @returns {string} base58 encoded multihash string
 */
function stringify(multihash: Multihash): string {
  const { digest, hashFunction, size } = multihash

  // cut off leading "0x"
  const hashBytes = Buffer.from(digest.slice(2), "hex")

  // prepend hashFunction and digest size
  const multihashBytes = Buffer.alloc(2 + hashBytes.length)
  multihashBytes[0] = hashFunction
  multihashBytes[1] = size
  multihashBytes.set(hashBytes, 2)

  return bs58.encode(multihashBytes)
}

function generate(input: string): Multihash {
  const hash = createHash("sha256").update(input).digest()
  return {
    digest: `0x${hash.toString("hex")}`,
    hashFunction: 0x12,
    size: 0x20
  }
}

export default {
  parse,
  stringify,
  generate
}
