import fs from 'fs'
import fsextra from 'fs-extra'
import path from 'path'
import os from 'os'

import { AsyncDatabase } from 'promised-sqlite3'
import { create as createIpfsRpcClient, type IPFSHTTPClient } from 'kubo-rpc-client'

export default class IPFSStorage {
  private readonly _client: IPFSHTTPClient
  private readonly _dbFile: string

  private constructor(client: IPFSHTTPClient, dbFile: string) {
    this._client = client
    this._dbFile = dbFile
  }

  get client(): IPFSHTTPClient {
    return this._client
  }

  static async create(ipfsRpcUrl: string, dbFile = path.resolve(os.tmpdir(), 'rpc3-server', 'db.sqlite')) {
    await fsextra.ensureDir(path.dirname(dbFile))
    const client = createIpfsRpcClient({ url: ipfsRpcUrl })
    return new IPFSStorage(client, dbFile)
  }

  async dropDatabase() {
    if (fs.existsSync(this._dbFile)) {
      await fs.promises.unlink(this._dbFile)
    }
  }

  async openDatabase() {
    const db = await AsyncDatabase.open(this._dbFile)
    db.inner.on('trace', sql => console.log('[TRACE]', sql))
    return db
  }

  async persistDatabase() {
    const buffer = await fs.promises.readFile(this._dbFile)
    const { cid } = await this._client.add(buffer)
    return cid
  }

  async restoreDatabase(multihash: string) {
    await fs.promises.writeFile(this._dbFile, this._client.cat(multihash))
  }
}
