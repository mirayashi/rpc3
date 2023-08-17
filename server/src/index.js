import Log from 'ipfs-log'
import IdentityProvider from 'orbit-db-identity-provider'
import * as IPFS from 'ipfs'

const start = async () => {
  const identity = await IdentityProvider.createIdentity({ id: 'peerid' })
  const ipfs = await IPFS.create({ repo: './data' })
  const log = new Log(ipfs, identity)

  const oldEntry = await Log.fromEntry(ipfs, identity, await log.append({ some: 'data' }))
  await log.append('text')

  console.log('oldEntry', oldEntry.values)

  await oldEntry.append('third')
  console.log('oldEntry with third', oldEntry.values)
}

start()
