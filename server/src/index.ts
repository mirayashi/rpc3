import { ethers } from 'ethers'
import * as sapphire from '@oasisprotocol/sapphire-paratime'

import { config } from '../app.config.js'
import common from 'rpc3-common'
const { RPC3Factory, multihash, utils } = common
import IPFSStorage from './IPFSStorage.js'

const ipfs = await IPFSStorage.create(config.ipfsRpcUrl)
const wallet = sapphire.wrap(new ethers.Wallet(config.walletPrivateKey, config.ethersProvider))

const contract = RPC3Factory.connect(config.contractAddress, wallet)

const registered = await contract.amIRegistered()
if (!registered) {
  const tx = await contract.serverRegister({ value: await contract.getStakeRequirement() })
  console.log('register tx', await tx.wait())
}

async function processBatch() {
  const batch = await contract.getCurrentBatch(0)
  if (Date.now() / 1000 > batch.expiresAt.toNumber()) {
    const tx = await contract.skipBatchIfConsensusExpired()
    console.log('skip batch tx', await tx.wait())
    return
  }
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
  const responseIpfsHash = multihash.parse((await ipfs.client.add(JSON.stringify(responses))).cid.toString())
  const tx = await contract.submitBatchResult(batch.nonce, { finalStateIpfsHash, responseIpfsHash })
  console.log('submit batch result tx', await tx.wait())
}

const handleBatchError = (err: unknown) => console.error('Failed to process batch', err)

await processBatch().catch(handleBatchError)

config.ethersProvider.on(contract.filters.NextBatchReady(), (log, event) => {
  console.log('NextBatchReady log', log)
  console.log('NextBatchReady event', event)
  processBatch().catch(handleBatchError)
})

console.log('Server started')
