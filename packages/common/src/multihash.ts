import bs58 from 'bs58'
import { createHash, BinaryLike } from 'crypto'
import { hexString2Buf, buf2HexString } from './utils'

export interface Multihash {
  header: string
  digest: string
}

export function parse(multihashStr: string): Multihash {
  const decoded = bs58.decode(multihashStr)

  return {
    header: buf2HexString(Buffer.concat([Buffer.alloc(30), decoded.slice(0, 2)])),
    digest: buf2HexString(decoded.slice(2))
  }
}

export function pack(multihashObj: Multihash): Uint8Array {
  const { header, digest } = multihashObj
  return Buffer.concat([hexString2Buf(header).subarray(30, 32), hexString2Buf(digest)])
}

export function stringify(multihashObj: Multihash): string {
  return bs58.encode(pack(multihashObj))
}

export function generate(input: BinaryLike): Multihash {
  return {
    header: '0x0000000000000000000000000000000000000000000000000000000000001220',
    digest: buf2HexString(createHash('sha256').update(input).digest())
  }
}
