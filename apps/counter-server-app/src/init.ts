import { config } from './app.config.js'
import { IPFSStorage } from '@rpc3/server'

const ipfs = await IPFSStorage.create(config.ipfsRpcUrl)
await ipfs.dropDatabase()
const db = await ipfs.openDatabase()

await db.run('CREATE TABLE counter(addr PRIMARY KEY, count)')

await db.close()

const multihash = await ipfs.persistDatabase()
console.log(`Initial database added to IPFS. IPFS CID: ${multihash}`)
