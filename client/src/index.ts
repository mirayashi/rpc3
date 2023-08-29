import { ethers } from 'ethers'
import * as sapphire from '@oasisprotocol/sapphire-paratime'
import { create as createIpfsRpcClient } from 'kubo-rpc-client'

import { multihash, RPC3Factory, utils } from 'rpc3-common'
import { config } from '../app.config.js'

const ipfs = createIpfsRpcClient({ url: config.ipfsRpcUrl })
const wallet = sapphire.wrap(new ethers.Wallet(config.walletPrivateKey, config.ethersProvider))

const contract = RPC3Factory.connect(config.contractAddress, wallet)

const { cid } = await ipfs.add(JSON.stringify({ count: 4 }))
console.log('request CID: %s', cid)

const pendingRequests = new Map<bigint, Array<bigint>>()

contract.on('RequestSubmitted', (requestNonce: ethers.BigNumber, batchNonce: ethers.BigNumber) => {
  console.log('Submitted request %d in batch %d', requestNonce, batchNonce)
  let requests = pendingRequests.get(batchNonce.toBigInt())
  if (!requests) {
    requests = []
    pendingRequests.set(batchNonce.toBigInt(), requests)
  }
  requests.push(requestNonce.toBigInt())
})

contract.on('BatchCompleted', async (batchNonce: ethers.BigNumber) => {
  const requests = pendingRequests.get(batchNonce.toBigInt()) ?? []
  pendingRequests.delete(batchNonce.toBigInt())
  for (const requestNonce of requests.map(r => ethers.BigNumber.from(r))) {
    console.log('Reading response for request %d (batch %d)', requestNonce, batchNonce)
    config.ethersProvider.once('block', async data => {
      const response = await contract.getResponse(requestNonce, { blockTag: data.blockNumber })
      const batchResultCid = multihash.stringify(response[0])
      const position = response[1].toNumber()
      console.log('[request %d] Batch result CID: %s, position: %d', requestNonce, batchResultCid, position)
      const batchResult = JSON.parse(await utils.asyncIterableToString(ipfs.cat(batchResultCid)))
      const responseCid = batchResult[position]
      const responseContent = JSON.parse(await utils.asyncIterableToString(ipfs.cat(responseCid)))
      console.log('[request %d] Response CID: %s, content: %s', requestNonce, responseCid, responseContent)
    })
  }
})

contract.on('BatchFailed', (batchNonce: ethers.BigNumber) => {
  if (!pendingRequests.delete(batchNonce.toBigInt())) {
    return
  }
  console.log('[request %d] BATCH FAILED', batchNonce)
})

const tx = await contract.sendRequest(multihash.parse(cid.toString()))
console.log('send request tx', await tx.wait())
