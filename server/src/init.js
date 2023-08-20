import path from 'path'
import debug from 'debug'
debug.enable('libp2p,libp2p:autonat')

import { AsyncDatabase } from 'promised-sqlite3'

import IPFSContainer from './IPFSContainer.js'

async function init() {
  const ipfsContainer = await IPFSContainer.create()
  const dbFilePath = path.resolve(ipfsContainer.getOutputDir(), 'db.sqlite')
  const db = await AsyncDatabase.open(dbFilePath)
  db.inner.on('trace', sql => console.log('[TRACE]', sql))

  await db.run('CREATE TABLE IF NOT EXISTS test(a INTEGER PRIMARY KEY AUTOINCREMENT, b, c)')

  await db.close()

  const multihash = await ipfsContainer.upload(dbFilePath)
  console.log(`Initial database uploaded. IPFS CID: ${multihash}`)
}

init()
