import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"
import { ethers } from "hardhat"

function toStruct(obj: Object) {
  return Object.assign(Object.values(obj), obj)
}

describe("REST3App", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deploy() {
    // Contracts are deployed using the first signer/account by default
    const [owner, ...users] = await ethers.getSigners()

    const StakeLib = await ethers.getContractFactory("StakeLib")
    const stakeLib = await StakeLib.deploy()
    await stakeLib.deployed()

    const REST3App = await ethers.getContractFactory("REST3App", {
      libraries: {
        StakeLib: stakeLib.address
      }
    })
    const globalParams = {
      defaultRequestCost: ethers.BigNumber.from(1),
      requestMaxTtl: ethers.BigNumber.from(20),
      minStake: ethers.utils.parseUnits("1.0", "ether"),
      consensusMinDuration: ethers.BigNumber.from(1),
      consensusMaxDuration: ethers.BigNumber.from(10),
      consensusQuorumPercent: ethers.BigNumber.from(85),
      consensusRatioPercent: ethers.BigNumber.from(85),
      maxInactivityFlags: ethers.BigNumber.from(5)
    }
    const stateIpfsHash = "foobar"
    const contract = await REST3App.deploy(globalParams, stateIpfsHash)

    return { contract, globalParams, stateIpfsHash, owner, users }
  }

  async function deployAndRegisterOwner() {
    const fixture = await deploy()
    await fixture.contract.serverRegister({ value: ethers.utils.parseUnits("1.0", "ether") })
    return fixture
  }

  async function deployAndRegister3Users() {
    const fixture = await deploy()
    const {
      contract,
      users: [user1, user2, user3]
    } = fixture
    await contract.connect(user1).serverRegister({ value: ethers.utils.parseUnits("1.0", "ether") })
    await contract.connect(user2).serverRegister({ value: ethers.utils.parseUnits("2.0", "ether") })
    await contract.connect(user3).serverRegister({ value: ethers.utils.parseUnits("4.0", "ether") })
    return fixture
  }

  describe("Deployment", function () {
    it("Should initialize correctly", async function () {
      const { contract, globalParams } = await loadFixture(deploy)
      expect(await contract._globalParams()).to.deep.equal(toStruct(globalParams))
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
          contract.serverRegister({ value: ethers.utils.parseUnits("2.0", "ether") })
        ).to.be.revertedWithCustomError(contract, "ServerAlreadyRegistered")
      })

      it("Should fail, below minimum stake", async () => {
        const { contract } = await loadFixture(deploy)
        await expect(
          contract.serverRegister({ value: ethers.utils.parseUnits("0.5", "ether") })
        ).to.be.revertedWithCustomError(contract, "InsufficientStake")
      })

      it("Should fail, above minimum stake but someone registered so it doubled the requirement", async () => {
        const {
          contract,
          users: [user1]
        } = await loadFixture(deployAndRegisterOwner)
        await expect(
          contract.connect(user1).serverRegister({ value: ethers.utils.parseUnits("1", "ether") })
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
        const {
          contract,
          users: [user1]
        } = await loadFixture(deployAndRegisterOwner)
        await expect(contract.connect(user1).serverUnregister()).to.be.revertedWithCustomError(
          contract,
          "ServerNotRegistered"
        )
      })
    })

    describe("getStakeAmount()", () => {
      it("Should equal min stake", async () => {
        const { contract } = await loadFixture(deploy)
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("1.0", "ether"))
      })

      it("Should double stake after 1 registration", async () => {
        const { contract } = await loadFixture(deployAndRegisterOwner)
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("2.0", "ether"))
      })

      it("Should double stake again after another registration", async () => {
        const {
          contract,
          users: [user1]
        } = await loadFixture(deployAndRegisterOwner)
        await contract.connect(user1).serverRegister({ value: ethers.utils.parseUnits("2.0", "ether") })
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("4.0", "ether"))
      })

      it("Should decrease stake in a linear way until a week passes, then halve every week until it goes back to minimum stake", async () => {
        const { contract } = await loadFixture(deployAndRegister3Users)
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("8", "ether"))
        await time.increase(120960)
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("7.2", "ether"))
        await time.increase(181440)
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("6", "ether"))
        await time.increase(302400)
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("4", "ether"))
        await time.increase(302400)
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("3", "ether"))
        await time.increase(302400)
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("2", "ether"))
        await time.increase(302400)
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("1.5", "ether"))
        await time.increase(302400)
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("1", "ether"))
        await time.increase(302400)
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("1", "ether"))
        await time.increase(302400)
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("1", "ether"))
      })

      it("Should adjust stake correctly taking into account both new registrations and over time decrease", async () => {
        const {
          contract,
          users: [user1, user2, user3, user4]
        } = await loadFixture(deploy)
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("1", "ether"))
        await time.increase(302400)
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("1", "ether"))
        await contract.connect(user1).serverRegister({ value: await contract.getStakeAmount() })
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("2", "ether"))
        await time.increase(302400)
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("1.5", "ether"))
        await contract.connect(user2).serverRegister({ value: await contract.getStakeAmount() })
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("3", "ether"))
        await time.increase(120960)
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("2.7", "ether"))
        await contract.connect(user3).serverRegister({ value: await contract.getStakeAmount() })
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("5.4", "ether"))
        await time.increase(7499520) // 12,4 weeks
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("1", "ether"))
        await contract.connect(user4).serverRegister({ value: await contract.getStakeAmount() })
        expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseUnits("2", "ether"))
      })
    })
  })
})
