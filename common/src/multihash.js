import bs58 from 'bs58'
import { createHash } from 'crypto'

/**
 * @typedef {{ header: string, digest: string }} Multihash
 */

function buf2String(buf) {
  return `0x${Buffer.from(buf).toString('hex')}`
}

function string2Buf(str) {
  return Buffer.from(str.substring(2), 'hex')
}

/**
 * Converts a base58-encoded multihash into an object representation of it that can be used in smart contracts.
 *
 * @param {string} multihashStr the hash string
 * @returns {Multihash} the hash as an object
 */
function parse(multihashStr) {
  const decoded = bs58.decode(multihashStr)
  return {
    header: buf2String(Buffer.concat([Buffer.alloc(30), decoded.subarray(0, 2)])),
    digest: buf2String(decoded.subarray(2))
  }
}

/**
 * Encodes a multihash given its object representation to a Buffer containing the raw hash data.
 *
 * @param {Multihash} multihashObj the object representation of a multihash
 * @returns {Buffer} a Buffer encoding the hash in binary
 */
function pack(multihashObj) {
  const { header, digest } = multihashObj
  return Buffer.concat([string2Buf(header).subarray(30, 32), string2Buf(digest)])
}

/**
 * Converts a multihash object to a base58-encoded string.
 * @param {Multihash} multihash the multihash as object
 * @returns {string} the multihash as string
 */
function stringify(multihash) {
  return bs58.encode(pack(multihash))
}

/**
 * Generates a multihash for a given input, using the CID v0 format.
 *
 * @param {import('crypto').BinaryLike} input the binary-like input
 * @returns {Multihash} a multihash as object
 */
function generate(input) {
  return {
    header: '0x0000000000000000000000000000000000000000000000000000000000001220',
    digest: buf2String(createHash('sha256').update(input).digest())
  }
}

export default {
  parse,
  pack,
  stringify,
  generate
}
