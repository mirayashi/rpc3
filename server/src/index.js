import { ethers } from 'ethers'

import abi from './abi.js'
import IPFSDatabase from './IPFSDatabase.js'

import { multihash } from 'rpc3-common'

const start = async () => {
  const ipfsDb = await IPFSDatabase.create()
  const contractAddr = '0x5894da463ee4791408b773489A292d67f040585a'
  const provider = new ethers.JsonRpcProvider('https://testnet.sapphire.oasis.dev', {
    name: 'sapphire-testnet',
    chainId: 0x5aff
  })
  const wallet = new ethers.Wallet(process.env.HH_PRIVATE_KEY, provider)

  const contract = new ethers.Contract(contractAddr, abi, wallet)

  if (!(await contract.amIRegistered())) {
    const tx = await contract.serverRegister({ value: await contract.getStakeRequirement() })
    await tx.wait()
  }

  provider.on(contract.filters.NextBatchReady(), async (log, event) => {
    const batch = await contract.getCurrentBatch(0)
    await ipfsDb.syncFromIPFS(multihash.stringify(batch.initialStateIpfsHash))
  })
}

start()
