import { ethers } from 'ethers'
import * as sapphire from '@oasisprotocol/sapphire-paratime'
import { create as createIpfsRpcClient } from 'kubo-rpc-client'

import { multihash, RPC3Factory } from 'rpc3-common'
import { config } from '../app.config.js'

const ipfs = createIpfsRpcClient({ url: config.ipfsRpcUrl })
const wallet = sapphire.wrap(new ethers.Wallet(config.walletPrivateKey, config.ethersProvider))

const contract = RPC3Factory.connect(config.contractAddress, wallet)

const { cid } = await ipfs.add(JSON.stringify({ count: 4 }))
console.log('request CID: %s', cid)

config.ethersProvider.on(contract.filters.RequestSubmitted(), (log, event) => {
  console.log('RequestSubmitted log', log)
  console.log('RequestSubmitted event', event)

  config.ethersProvider.once(contract.filters.BatchCompleted(/* TODO batch number here */), something => {
    console.log(something)
    // TODO: read response
  })
})

const tx = await contract.sendRequest(multihash.parse(cid.toString()))
console.log('send request tx', await tx.wait())
