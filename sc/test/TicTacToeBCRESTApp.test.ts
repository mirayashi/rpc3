import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
import { expect } from "chai"
import { ethers } from "hardhat"
import { TicTacToeBCRESTApp } from "../typechain-types"

function toStruct(obj: Object) {
  return Object.assign(Object.values(obj), obj)
}

describe("TicTacToeBCRESTApp", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deploy() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners()

    const TicTacToeBCRESTApp = await ethers.getContractFactory("TicTacToeBCRESTApp")
    const globalParams = {
      defaultRequestCost: ethers.BigNumber.from(1),
      requestMaxTtl: ethers.BigNumber.from(20000),
      minStake: ethers.utils.parseUnits("1.0", "ether")
    }
    const contract = await TicTacToeBCRESTApp.deploy(globalParams)

    return { contract, globalParams, owner, otherAccount }
  }

  describe("Deployment", function () {
    it("Should set the right global parameters", async function () {
      const { contract, globalParams } = await loadFixture(deploy)
      expect(await contract.globalParams()).to.deep.equal(toStruct(globalParams))
    })
  })

  describe("Server registration", function () {
    let fixture: { contract: TicTacToeBCRESTApp; globalParams: any; owner: any; otherAccount: any }
    before(async () => {
      fixture = await loadFixture(deploy)
    })

    describe("serverRegister()", () => {
      it("Should pass", async () => {
        const { contract, globalParams } = fixture
        await expect(contract.serverRegister({ value: ethers.utils.parseUnits("1.0", "ether") })).to.not.be.reverted
        expect(await ethers.provider.getBalance(contract.address)).to.equal(globalParams.minStake)
      })

      it("Should fail, already registered", async () => {
        const { contract } = fixture
        await expect(
          contract.serverRegister({ value: ethers.utils.parseUnits("1.0", "ether") })
        ).to.be.revertedWithCustomError(contract, "ServerAlreadyRegistered")
      })

      it("Should fail, insufficient stake", async () => {
        const { contract, otherAccount } = fixture
        await expect(
          contract.connect(otherAccount).serverRegister({ value: ethers.utils.parseUnits("0.5", "ether") })
        ).to.be.revertedWithCustomError(contract, "InsufficientStake")
      })
    })

    describe("serverUnregister()", () => {
      it("Should pass", async () => {
        const { contract } = fixture
        await expect(contract.serverUnregister()).to.not.be.reverted
        expect(await ethers.provider.getBalance(contract.address)).to.equal(ethers.BigNumber.from(0))
      })

      it("Should fail, already unregistered", async () => {
        const { contract, otherAccount } = fixture
        await expect(contract.connect(otherAccount).serverUnregister()).to.be.revertedWithCustomError(
          contract,
          "ServerNotRegistered"
        )
      })
    })
  })
})
