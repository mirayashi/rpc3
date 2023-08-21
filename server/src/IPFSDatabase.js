import fs from 'fs'
import fsextra from 'fs-extra'
import path from 'path'
import os from 'os'

import { create } from 'kubo-rpc-client'
import { AsyncDatabase } from 'promised-sqlite3'

export default class IPFSDatabase {
  /**
   * @typedef {import('kubo-rpc-client/dist/src').IPFSHTTPClient} IPFSHTTPClient
   * @param {IPFSHTTPClient} client
   * @param {*} dbFile
   */
  constructor(client, dbFile) {
    this.client = client
    this.dbFile = dbFile
  }

  static async create(dbFile = path.resolve(os.tmpdir(), 'rpc3-db', 'db.sqlite')) {
    await fsextra.ensureDir(path.dirname(dbFile))
    const client = create()
    return new IPFSDatabase(client, dbFile)
  }

  async clean() {
    if (fs.existsSync(this.dbFile)) {
      await fs.promises.unlink(this.dbFile)
    }
  }

  async open() {
    return AsyncDatabase.open(this.dbFile)
  }

  async persistToIPFS() {
    const buffer = await fs.promises.readFile(this.dbFile)
    const { cid } = await this.client.add(buffer)
    return cid
  }

  async syncFromIPFS(multihash) {
    await fs.promises.writeFile(this.dbFile, this.client.cat(multihash))
  }
}
