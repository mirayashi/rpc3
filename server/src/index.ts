import { ethers } from 'ethers'

// import IPFSDatabase from './IPFSDatabase.js'

// import { multihash } from 'rpc3-common'

import { RPC3__factory } from './generated/RPC3__factory.js'

const start = async () => {
  // const ipfsDb = await IPFSDatabase.create()
  const contractAddr = '0xDba114570C1DA039EcC34d79084956e8c09B8250'
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
  // provider.on(contract.filters.NextBatchReady(), async (log, event) => {
  //   const batch = await contract.getCurrentBatch(0)
  //   await ipfsDb.syncFromIPFS(multihash.stringify(batch.initialStateIpfsHash))
  // })
}

start()
