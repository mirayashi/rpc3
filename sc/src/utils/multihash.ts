import bs58 from "bs58"
import { createHash } from "crypto"

export interface Multihash {
  header: string
  digest: string
}

function buf2String(buf: Uint8Array) {
  return `0x${Buffer.from(buf).toString("hex")}`
}
function string2Buf(str: string) {
  return Buffer.from(str.substring(2), "hex")
}

function parse(multihash: string): Multihash {
  const decoded = bs58.decode(multihash)

  return {
    header: buf2String(Buffer.concat([Buffer.alloc(30), decoded.slice(0, 2)])),
    digest: buf2String(decoded.slice(2))
  }
}

function pack(multihash: Multihash): Uint8Array {
  const { header, digest } = multihash
  return Buffer.concat([string2Buf(header).subarray(30, 32), string2Buf(digest)])
}

function stringify(multihash: Multihash): string {
  return bs58.encode(pack(multihash))
}

function generate(input: string): Multihash {
  return {
    header: "0x0000000000000000000000000000000000000000000000000000000000001220",
    digest: buf2String(createHash("sha256").update(input).digest())
  }
}

export default {
  parse,
  pack,
  stringify,
  generate
}
