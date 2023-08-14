import { time } from "@nomicfoundation/hardhat-network-helpers"
import { ethers } from "hardhat"
import { Contract, Signer } from "ethers"

export function toStruct<T extends object>(obj: T): T {
  return Object.assign(Object.values(obj), obj)
}

export async function registerManyServers(contract: Contract, owner: Signer, count: number): Promise<Signer[]> {
  const wallets = await ethers.getSigners()
  const registered: Signer[] = []
  for (let i = 0; i < count && i < wallets.length; i++) {
    const wallet = wallets[i]
    await contract.connect(wallet).serverRegister({ value: ethers.utils.parseEther("1") })
    process.stdout.write(`\r        Registered server ${i + 1}/${count}`)
    registered.push(wallet)
    await time.increase(604800)
  }
  console.log()
  return registered
}
