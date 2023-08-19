import fs from 'fs/promises'

import Log from 'ipfs-log'
import IdentityProvider from 'orbit-db-identity-provider'
import * as IPFS from 'ipfs'

export default class IPFSContainer {
  /**
   * @typedef {import('ipfs-core-types').IPFS} IPFS
   * @param identity
   * @param ipfs {IPFS}
   */
  constructor(identity, ipfs) {
    this.identity = identity
    this.ipfs = ipfs
  }

  static async create(identityId, dataDir) {
    const identity = await IdentityProvider.createIdentity({ id: identityId })
    const ipfs = await IPFS.create({ repo: dataDir })
    return new IPFSContainer(identity, ipfs)
  }

  async upload(dbFilePath, parentMultihash) {
    const buffer = await fs.readFile(dbFilePath)
    const result = await this.ipfs.add(buffer)
    const log = parentMultihash
      ? await Log.fromEntryHash(this.ipfs, this.identity, parentMultihash, { length: 1 })
      : new Log(this.ipfs, this.identity)
    const newEntry = await log.append(result.path)
    return newEntry.hash
  }

  async download(multihash, dbFilePath) {
    const log = await Log.fromEntryHash(this.ipfs, this.identity, multihash, { length: 1 })
    const dbFileMultihash = log.values[0].payload
    await fs.writeFile(dbFilePath, this.ipfs.cat(dbFileMultihash))
  }
}
