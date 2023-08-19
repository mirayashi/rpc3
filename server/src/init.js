import path from 'path'
import { fileURLToPath } from 'url'
import fsextra from 'fs-extra'

import { AsyncDatabase } from 'promised-sqlite3'

import IPFSContainer from './IPFSContainer.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const IDENTITY_ID = 'rest3'
const DATA_DIR = path.resolve(__dirname, '..', 'data')

async function init() {
  const dir = path.resolve(__dirname, '..', 'output')
  await fsextra.ensureDir(dir)
  const dbFilePath = path.resolve(dir, 'db.sqlite')
  const db = await AsyncDatabase.open(dbFilePath)
  db.inner.on('trace', sql => console.log('[TRACE]', sql))

  await db.run('CREATE TABLE IF NOT EXISTS test(a INTEGER PRIMARY KEY AUTOINCREMENT, b)')

  await db.close()

  const ipfsContainer = await IPFSContainer.create(IDENTITY_ID, DATA_DIR)
  const multihash = await ipfsContainer.upload(dbFilePath)
  console.log(`Initial database uploaded. IPFS CID: ${multihash}`)
}

init()
