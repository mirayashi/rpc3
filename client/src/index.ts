import { ethers } from 'ethers'
import * as sapphire from '@oasisprotocol/sapphire-paratime'
import { create } from 'kubo-rpc-client'

import { multihash, RPC3Factory } from 'rpc3-common'

const ipfs = create()
const contractAddr = '0x21C6aD34FD59Ccf8f4Fe76D31A866D421B78E854'
const provider = ethers.getDefaultProvider(sapphire.NETWORKS.testnet.defaultGateway)
if (!process.env.HH_PRIVATE_KEY) {
  throw new Error('Missing env HH_PRIVATE_KEY')
}
const wallet = sapphire.wrap(new ethers.Wallet(process.env.HH_PRIVATE_KEY, provider))

const contract = RPC3Factory.connect(contractAddr, wallet)

const { cid } = await ipfs.add(JSON.stringify({ count: 4 }))
console.log('request CID: %s', cid)

provider.on(contract.filters.RequestSubmitted(), (log, event) => {
  console.log('RequestSubmitted log', log)
  console.log('RequestSubmitted event', event)

  provider.once(contract.filters.BatchCompleted(/* TODO batch number here */), something => {
    console.log(something)
    // TODO: read response
  })
})

const tx = await contract.sendRequest(multihash.parse(cid.toString()))
console.log('send request tx', await tx.wait())
