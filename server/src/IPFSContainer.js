import fs from 'fs/promises'
import fsextra from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

import { unixfs } from '@helia/unixfs'
import { createHelia } from 'helia'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { bootstrap } from '@libp2p/bootstrap'
import { tcp } from '@libp2p/tcp'
import { createLibp2p } from 'libp2p'
import { identifyService } from 'libp2p/identify'
import { MemoryDatastore } from 'datastore-core'
import { autoNATService } from 'libp2p/autonat'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const __root = path.resolve(__dirname, '..')

export default class IPFSContainer {
  constructor(helia, heliaFs, outputDir) {
    this.helia = helia
    this.heliaFs = heliaFs
    this.outputDir = outputDir
  }

  static async create(outputDir = path.resolve(__root, 'output')) {
    await fsextra.ensureDir(outputDir)
    const datastore = new MemoryDatastore()
    const libp2p = await createLibp2p({
      datastore,
      addresses: {
        listen: ['/ip4/0.0.0.0/tcp/4001', '/ip6/::0/tcp/4002']
      },
      transports: [tcp()],
      connectionEncryption: [noise()],
      streamMuxers: [yamux()],
      peerDiscovery: [
        bootstrap({
          list: [
            '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
            '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
            '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
            '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt'
          ]
        })
      ],
      services: {
        identify: identifyService(),
        autoNAT: autoNATService()
      }
    })
    console.log('listening on addresses:')
    libp2p.getMultiaddrs().forEach(addr => {
      console.log(addr.toString())
    })
    const helia = await createHelia({ datastore, libp2p })
    const heliaFs = unixfs(helia)
    return new IPFSContainer(helia, heliaFs, outputDir)
  }

  async upload(dbFilePath) {
    const buffer = await fs.readFile(path.resolve(this.outputDir, dbFilePath))
    const cid = await this.heliaFs.addBytes(buffer)
    await this.helia.pins.add(cid)
    return cid
  }

  async download(multihash, dbFilePath) {
    await fs.writeFile(path.resolve(this.outputDir, dbFilePath), this.heliaFs.cat(multihash))
  }

  getOutputDir() {
    return this.outputDir
  }
}
