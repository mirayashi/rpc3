import { ethers } from 'ethers'

import abi from './rest3AppAbi.js'
// IPFSDatabase from './IPFSDatabase.js'

const start = async () => {
  //const ipfsDb = await IPFSDatabase.create()
  const contractAddr = '0x5894da463ee4791408b773489A292d67f040585a'
  const provider = new ethers.JsonRpcProvider('https://testnet.sapphire.oasis.dev', {
    name: 'sapphire-testnet',
    chainId: 0x5aff
  })
  const wallet = new ethers.Wallet(process.env.HH_PRIVATE_KEY, provider)

  const contract = new ethers.Contract(contractAddr, abi, wallet)
  const tx = await contract.serverRegister({ value: ethers.parseEther('1') })
  console.log(await tx.wait())
}

start()
