import fs from 'fs'
import fsextra from 'fs-extra'
import path from 'path'
import os from 'os'

import { AsyncDatabase } from 'promised-sqlite3'
import { create } from 'kubo-rpc-client'
import type { IPFSHTTPClient } from 'kubo-rpc-client'

export default class IPFSStorage {
  private _client: IPFSHTTPClient
  private dbFile: string

  constructor(client: IPFSHTTPClient, dbFile: string) {
    this._client = client
    this.dbFile = dbFile
  }

  get client(): IPFSHTTPClient {
    return this._client
  }

  static async create(dbFile = path.resolve(os.tmpdir(), 'rpc3-db', 'db.sqlite')) {
    await fsextra.ensureDir(path.dirname(dbFile))
    const client = create()
    return new IPFSStorage(client, dbFile)
  }

  async dropDatabase() {
    if (fs.existsSync(this.dbFile)) {
      await fs.promises.unlink(this.dbFile)
    }
  }

  async openDatabase() {
    const db = await AsyncDatabase.open(this.dbFile)
    db.inner.on('trace', sql => console.log('[TRACE]', sql))
    return db
  }

  async persistDatabase() {
    const buffer = await fs.promises.readFile(this.dbFile)
    const { cid } = await this._client.add(buffer)
    return cid
  }

  async restoreDatabase(multihash: string) {
    await fs.promises.writeFile(this.dbFile, this._client.cat(multihash))
  }
}
