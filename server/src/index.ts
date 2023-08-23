import { ethers } from 'ethers'

import { multihash, utils } from 'rpc3-common'
import IPFSStorage from './IPFSStorage.js'
import { RPC3__factory } from './generated/RPC3__factory.js'

const ipfs = await IPFSStorage.create()
const contractAddr = '0x9f63FED349F243d565cCBC53957f204bb6Fb6fa4'
const provider = new ethers.providers.JsonRpcProvider('https://testnet.sapphire.oasis.dev', {
  name: 'sapphire-testnet',
  chainId: 0x5aff
})
if (!process.env.HH_PRIVATE_KEY) {
  throw new Error('Missing env HH_PRIVATE_KEY')
}
const wallet = new ethers.Wallet(process.env.HH_PRIVATE_KEY, provider)

const contract = RPC3__factory.connect(contractAddr, wallet)

if (!(await contract.amIRegistered())) {
  const tx = await contract.serverRegister({ value: await contract.getStakeRequirement() })
  await tx.wait()
}

provider.on(contract.filters.NextBatchReady(), async (log, event) => {
  console.log('NextBatchReady log', log)
  console.log('NextBatchReady event', event)
  const batch = await contract.getCurrentBatch(0)
  await ipfs.restoreDatabase(multihash.stringify(batch.initialStateIpfsHash))
  const db = await ipfs.openDatabase()
  const responses: string[] = []
  for (const { author, ipfsHash } of batch.requests) {
    const cid = multihash.stringify(ipfsHash)
    const payload = JSON.parse(await utils.asyncIterableToString(ipfs.client.cat(cid)))
    await db.run(
      'INSERT INTO counter(addr, count) VALUES (?, ?) ON CONFLICT(addr) DO UPDATE SET count = count + excluded.count',
      author,
      payload.count
    )
    const newCount: number = await db.get('SELECT count FROM counter WHERE addr = ?', author)
    const addResult = await ipfs.client.add(JSON.stringify({ status: 'ok', newCount }))
    responses.push(addResult.cid.toString())
  }
  await db.close()
  const finalStateIpfsHash = multihash.parse((await ipfs.persistDatabase()).toString())
  const responseIpfsHash = multihash.parse((await ipfs.client.add(JSON.stringify(responses))).toString())
  await contract.submitBatchResult(batch.nonce, { finalStateIpfsHash, responseIpfsHash })
})
