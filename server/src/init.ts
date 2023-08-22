import IPFSDatabase from './IPFSDatabase.js'

async function init() {
  const ipfsDb = await IPFSDatabase.create()
  await ipfsDb.clean()
  const db = await ipfsDb.open()
  db.inner.on('trace', sql => console.log('[TRACE]', sql))

  await db.run('CREATE TABLE test(a, b)')
  await db.run('INSERT INTO test VALUES (1, 2)')

  await db.close()

  const multihash = await ipfsDb.persistToIPFS()
  console.log(`Initial database added to IPFS. IPFS CID: ${multihash}`)
}

init()
