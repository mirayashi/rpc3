import { ethers } from "hardhat"
import multihash from "../src/utils/multihash"

async function main() {
  const REST3App = await ethers.getContractFactory("REST3App")
  const globalParams = {
    defaultRequestCost: ethers.BigNumber.from(1),
    minStake: ethers.utils.parseEther("1"),
    consensusMaxDuration: ethers.BigNumber.from(60),
    consensusQuorumPercent: ethers.BigNumber.from(75),
    consensusRatioPercent: ethers.BigNumber.from(51),
    inactivityDuration: ethers.BigNumber.from(3600),
    slashPercent: ethers.BigNumber.from(2),
    housekeepBaseReward: ethers.BigNumber.from(3),
    revealReward: ethers.BigNumber.from(5),
    randomBackoffMin: ethers.BigNumber.from(6),
    randomBackoffMax: ethers.BigNumber.from(24)
  }
  const stateIpfsHash = multihash.generate("foobar")
  const contract = await REST3App.deploy(globalParams, stateIpfsHash)

  await contract.deployed()

  console.log(`REST3App deployed to ${contract.address}`)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
