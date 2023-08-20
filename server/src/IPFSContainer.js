import fs from 'fs/promises'
import fsextra from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

import { create } from 'kubo-rpc-client'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const __root = path.resolve(__dirname, '..')

export default class IPFSContainer {
  /**
   * @typedef {import('kubo-rpc-client/dist/src').IPFSHTTPClient} IPFSHTTPClient
   * @param {IPFSHTTPClient} client
   * @param {*} outputDir
   */
  constructor(client, outputDir) {
    this.client = client
    this.outputDir = outputDir
  }

  static async create(outputDir = path.resolve(__root, 'output')) {
    await fsextra.ensureDir(outputDir)
    const client = create()
    return new IPFSContainer(client, outputDir)
  }

  async upload(dbFilePath) {
    const buffer = await fs.readFile(path.resolve(this.outputDir, dbFilePath))
    const { cid } = await this.client.add(buffer)
    return cid
  }

  async download(multihash, dbFilePath) {
    await fs.writeFile(path.resolve(this.outputDir, dbFilePath), this.client.cat(multihash))
  }

  getOutputDir() {
    return this.outputDir
  }
}
