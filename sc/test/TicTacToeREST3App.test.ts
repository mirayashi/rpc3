import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
import { expect } from "chai"
import { ethers } from "hardhat"
import { TicTacToeREST3App } from "../typechain-types"

function toStruct(obj: Object) {
  return Object.assign(Object.values(obj), obj)
}

describe("TicTacToeREST3App", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deploy() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners()

    const TicTacToeREST3App = await ethers.getContractFactory("TicTacToeREST3App")
    const globalParams = {
      defaultRequestCost: ethers.BigNumber.from(1),
      requestMaxTtl: ethers.BigNumber.from(20000),
      minStake: ethers.utils.parseUnits("1.0", "ether")
    }
    const stateIpfsHash = "foobar"
    const contract = await TicTacToeREST3App.deploy(globalParams, stateIpfsHash)

    return { contract, globalParams, stateIpfsHash, owner, otherAccount }
  }

  async function deployAndRegisterOwner() {
    const fixture = await deploy()
    await fixture.contract.serverRegister({ value: ethers.utils.parseUnits("1.0", "ether") })
    return fixture
  }

  describe("Deployment", function () {
    it("Should initialize correctly", async function () {
      const { contract, globalParams, stateIpfsHash } = await loadFixture(deploy)
      expect(await contract.globalParams()).to.deep.equal(toStruct(globalParams))
      expect(await contract.stateIpfsHash()).to.equal(stateIpfsHash)
    })
  })

  describe("Server registration", function () {
    describe("serverRegister()", () => {
      it("Should pass", async () => {
        const { contract, globalParams } = await loadFixture(deploy)
        await expect(contract.serverRegister({ value: ethers.utils.parseUnits("1.0", "ether") })).to.not.be.reverted
        expect(await ethers.provider.getBalance(contract.address)).to.equal(globalParams.minStake)
      })

      it("Should fail, already registered", async () => {
        const { contract } = await loadFixture(deployAndRegisterOwner)
        await expect(
          contract.serverRegister({ value: ethers.utils.parseUnits("1.0", "ether") })
        ).to.be.revertedWithCustomError(contract, "ServerAlreadyRegistered")
      })

      it("Should fail, insufficient stake", async () => {
        const { contract, otherAccount } = await loadFixture(deployAndRegisterOwner)
        await expect(
          contract.connect(otherAccount).serverRegister({ value: ethers.utils.parseUnits("0.5", "ether") })
        ).to.be.revertedWithCustomError(contract, "InsufficientStake")
      })
    })

    describe("serverUnregister()", () => {
      it("Should pass", async () => {
        const { contract } = await loadFixture(deployAndRegisterOwner)
        await expect(contract.serverUnregister()).to.not.be.reverted
        expect(await ethers.provider.getBalance(contract.address)).to.equal(ethers.BigNumber.from(0))
      })

      it("Should fail, not registered", async () => {
        const { contract, otherAccount } = await loadFixture(deployAndRegisterOwner)
        await expect(contract.connect(otherAccount).serverUnregister()).to.be.revertedWithCustomError(
          contract,
          "ServerNotRegistered"
        )
      })
    })
  })
})
