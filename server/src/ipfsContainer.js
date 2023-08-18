import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import fsextra from 'fs-extra'

import Log from 'ipfs-log'
import IdentityProvider from 'orbit-db-identity-provider'
import * as IPFS from 'ipfs'
import { Mutex } from 'async-mutex'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const IDENTITY_ID = 'rest3'
const DATA_DIR = path.resolve(__dirname, '..', 'data')

const mutex = new Mutex()

let _identity

/**
 * @typedef {import('ipfs-core-types').IPFS} IPFS
 * @type IPFS
 */
let _ipfs

export async function getInstance() {
  return mutex.runExclusive(async () => {
    _identity ??= await IdentityProvider.createIdentity({ id: IDENTITY_ID })
    _ipfs ??= await IPFS.create({ repo: DATA_DIR })
    return { identity: _identity, ipfs: _ipfs }
  })
}

export async function upload(dbFilePath, parentMultihash) {
  const { identity, ipfs } = await getInstance()
  const buffer = await fs.promises.readFile(dbFilePath)
  const result = await ipfs.add(buffer)
  const log = parentMultihash
    ? await Log.fromEntryHash(ipfs, identity, parentMultihash, { length: 1 })
    : new Log(ipfs, identity)
  const newEntry = await log.append(result.cid)
  return newEntry.hash
}

export async function download(multihash, dbFilePath) {
  const { identity, ipfs } = await getInstance()
  const log = await Log.fromEntryHash(ipfs, identity, multihash, { length: 1 })
  const dbFileMultihash = log.values[0].payload
  await fs.promises.writeFile(dbFilePath, ipfs.get(dbFileMultihash))
}
