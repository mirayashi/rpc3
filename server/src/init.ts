import IPFSStorage from './IPFSStorage.js'

const ipfs = await IPFSStorage.create()
await ipfs.dropDatabase()
const db = await ipfs.openDatabase()
db.inner.on('trace', sql => console.log('[TRACE]', sql))

await db.run('CREATE TABLE counter(addr PRIMARY KEY, count)')

await db.close()

const multihash = await ipfs.persistDatabase()
console.log(`Initial database added to IPFS. IPFS CID: ${multihash}`)
