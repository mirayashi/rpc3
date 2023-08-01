import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"
import { ethers } from "hardhat"
import { batchResult1, batchResult2 } from "./data/batchResult"

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
      minStake: ethers.utils.parseEther("1"),
      consensusMaxDuration: ethers.BigNumber.from(10),
      consensusQuorumPercent: ethers.BigNumber.from(75),
      consensusRatioPercent: ethers.BigNumber.from(75),
      inactivityDuration: ethers.BigNumber.from(3600)
    }
    const stateIpfsHash = "foobar"
    const contract = await REST3App.deploy(globalParams, stateIpfsHash)

    return { contract, globalParams, stateIpfsHash, owner, users }
  }

  async function deployAndRegisterOwner() {
    const fixture = await deploy()
    await fixture.contract.serverRegister({ value: ethers.utils.parseEther("1") })
    return fixture
  }

  async function deployAndRegister4Users() {
    const fixture = await deploy()
    const {
      contract,
      users: [user1, user2, user3, user4]
    } = fixture
    const usersLastSeen = []
    await contract.connect(user1).serverRegister({ value: ethers.utils.parseEther("1") })
    usersLastSeen.push(await time.latest())
    await contract.connect(user2).serverRegister({ value: ethers.utils.parseEther("2") })
    usersLastSeen.push(await time.latest())
    await contract.connect(user3).serverRegister({ value: ethers.utils.parseEther("4") })
    usersLastSeen.push(await time.latest())
    await contract.connect(user4).serverRegister({ value: ethers.utils.parseEther("8") })
    usersLastSeen.push(await time.latest())
    return { ...fixture, usersLastSeen }
  }

  async function deployAndSubmitOneRequest() {
    const fixture = await deployAndRegister4Users()
    const { contract } = fixture
    const requestTimestamps: any = {}
    await contract.sendRequest("request1")
    requestTimestamps["request1"] = await time.latest()
    return { ...fixture, requestTimestamps }
  }

  describe("Deployment", function () {
    it("Should initialize correctly", async function () {
      const { contract, globalParams } = await loadFixture(deploy)
      expect(await contract._globalParams()).to.deep.equal(toStruct(globalParams))
    })
  })

  describe("Server registration", function () {
    it("Should register server", async () => {
      const { contract, owner, globalParams } = await loadFixture(deploy)
      await expect(contract.serverRegister({ value: ethers.utils.parseEther("1") })).to.not.be.reverted
      expect(await contract.getContributionData()).to.deep.equal(
        toStruct({
          addr: owner.address,
          stake: globalParams.minStake,
          contributions: 0,
          lastSeen: await time.latest()
        })
      )
      expect(await ethers.provider.getBalance(contract.address)).to.equal(globalParams.minStake)
    })

    it("Should not register server, already registered", async () => {
      const { contract } = await loadFixture(deployAndRegisterOwner)
      await expect(contract.serverRegister({ value: ethers.utils.parseEther("2") })).to.be.revertedWithCustomError(
        contract,
        "ServerAlreadyRegistered"
      )
    })

    it("Should not register server, below minimum stake", async () => {
      const { contract } = await loadFixture(deploy)
      await expect(contract.serverRegister({ value: ethers.utils.parseEther("0.5") })).to.be.revertedWithCustomError(
        contract,
        "InsufficientStake"
      )
    })

    it("Should not register server, stake requirement has been doubled", async () => {
      const {
        contract,
        users: [user1]
      } = await loadFixture(deployAndRegisterOwner)
      await expect(
        contract.connect(user1).serverRegister({ value: ethers.utils.parseEther("1") })
      ).to.be.revertedWithCustomError(contract, "InsufficientStake")
    })

    it("Should unregister server", async () => {
      const { contract } = await loadFixture(deployAndRegisterOwner)
      await expect(contract.serverUnregister()).to.not.be.reverted
      expect(await ethers.provider.getBalance(contract.address)).to.equal(ethers.BigNumber.from(0))
      await expect(contract.getContributionData()).to.be.revertedWithCustomError(contract, "ServerNotRegistered")
    })

    it("Should not unregister server, not registered", async () => {
      const {
        contract,
        users: [user1]
      } = await loadFixture(deployAndRegisterOwner)
      await expect(contract.connect(user1).serverUnregister()).to.be.revertedWithCustomError(
        contract,
        "ServerNotRegistered"
      )
    })

    it("Should be at minimum stake", async () => {
      const { contract } = await loadFixture(deploy)
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("1"))
    })

    it("Should double stake after 1 registration", async () => {
      const { contract } = await loadFixture(deployAndRegisterOwner)
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("2"))
    })

    it("Should double stake again (x4) after another registration", async () => {
      const {
        contract,
        users: [user1]
      } = await loadFixture(deployAndRegisterOwner)
      await contract.connect(user1).serverRegister({ value: ethers.utils.parseEther("2") })
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("4"))
    })

    it("Should decrease stake in a linear way until a week passes, then halve every week until it goes back to minimum stake", async () => {
      const { contract } = await loadFixture(deployAndRegister4Users)
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("16"))
      await time.increase(120960)
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("14.4"))
      await time.increase(181440)
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("12"))
      await time.increase(302400)
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("8"))
      await time.increase(302400)
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("6"))
      await time.increase(302400)
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("4"))
      await time.increase(302400)
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("3"))
      await time.increase(302400)
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("2"))
      await time.increase(302400)
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("1.5"))
      await time.increase(302400)
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("1"))
      await time.increase(302400)
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("1"))
      await time.increase(302400)
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("1"))
    })

    it("Should adjust stake correctly taking into account both new registrations and over time decrease", async () => {
      const {
        contract,
        users: [user1, user2, user3, user4]
      } = await loadFixture(deploy)
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("1"))
      await time.increase(302400)
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("1"))
      await contract.connect(user1).serverRegister({ value: await contract.getStakeAmount() })
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("2"))
      await time.increase(302400)
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("1.5"))
      await contract.connect(user2).serverRegister({ value: await contract.getStakeAmount() })
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("3"))
      await time.increase(120960)
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("2.7"))
      await contract.connect(user3).serverRegister({ value: await contract.getStakeAmount() })
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("5.4"))
      await time.increase(6048000) // 10 weeks
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("1"))
      await contract.connect(user4).serverRegister({ value: await contract.getStakeAmount() })
      expect(await contract.getStakeAmount()).to.deep.equal(ethers.utils.parseEther("2"))
    })
  })

  describe("Request submission", () => {
    async function expectThatCurrentBatchHas(
      contract: any,
      {
        stateIpfsHash,
        requests,
        sizeOf
      }: {
        stateIpfsHash?: string
        requests?: Array<any>
        sizeOf?: number
      }
    ) {
      const batchView = await contract.getCurrentBatch()
      if (stateIpfsHash) {
        expect(batchView.initialStateIpfsHash).to.equal(stateIpfsHash)
      }
      if (sizeOf) {
        expect(batchView.requests).to.have.lengthOf(sizeOf)
      }
      if (requests) {
        expect(batchView.requests).to.deep.equal(requests)
      }
    }

    it("Should not be able to view current batch if not registered", async () => {
      const {
        contract,
        users: [user1]
      } = await loadFixture(deployAndRegisterOwner)
      await expect(contract.connect(user1).getCurrentBatch()).to.be.revertedWithCustomError(
        contract,
        "ServerNotRegistered"
      )
    })

    it("Should initialize first batch", async () => {
      const {
        contract,
        users: [user1],
        stateIpfsHash
      } = await loadFixture(deployAndRegisterOwner)
      await expectThatCurrentBatchHas(contract, { stateIpfsHash, sizeOf: 0 })

      await expect(contract.connect(user1).sendRequest("request1")).to.emit(contract, "NextBatchReady")
      await expectThatCurrentBatchHas(contract, {
        stateIpfsHash,
        sizeOf: 1,
        requests: [
          toStruct({
            nonce: ethers.BigNumber.from(1),
            ipfsHash: "request1",
            currentTime: ethers.BigNumber.from(await time.latest()),
            author: user1.address
          })
        ]
      })
    })

    it("Should enqueue subsequent requests", async () => {
      const {
        contract,
        owner,
        users: [user1],
        stateIpfsHash,
        requestTimestamps: { request1 }
      } = await loadFixture(deployAndSubmitOneRequest)

      await contract.sendRequest("request2")
      // request2 should be only in queue, not in batch
      await expectThatCurrentBatchHas(contract.connect(user1), {
        stateIpfsHash,
        sizeOf: 1,
        requests: [
          toStruct({
            nonce: ethers.BigNumber.from(1),
            ipfsHash: "request1",
            currentTime: ethers.BigNumber.from(request1),
            author: owner.address
          })
        ]
      })
    })
  })

  describe("Batch result submissions", () => {
    it("Should revert if not registered", async () => {
      const {
        contract,
        owner,
        users: [user1]
      } = await loadFixture(deployAndRegisterOwner)
      await expect(
        contract.connect(user1).submitBatchResult(batchResult1("", owner.address))
      ).to.be.revertedWithCustomError(contract, "ServerNotRegistered")
    })

    it("Should revert if empty batch", async () => {
      const { contract, owner } = await loadFixture(deployAndRegisterOwner)
      await expect(contract.submitBatchResult(batchResult1("", owner.address))).to.be.revertedWithCustomError(
        contract,
        "EmptyBatch"
      )
    })

    it("Should revert if initial state IPFS hash mismatches", async () => {
      const {
        contract,
        owner,
        users: [user1]
      } = await loadFixture(deployAndSubmitOneRequest)
      await expect(
        contract.connect(user1).submitBatchResult(batchResult1("fake", owner.address))
      ).to.be.revertedWithCustomError(contract, "IncorrectInitialState")
    })

    it("Should revert if attempt to submit result more than once", async () => {
      const {
        contract,
        owner,
        users: [user1],
        stateIpfsHash
      } = await loadFixture(deployAndSubmitOneRequest)
      await expect(contract.connect(user1).submitBatchResult(batchResult1(stateIpfsHash, owner.address))).to.emit(
        contract,
        "BatchResultRecorded"
      )
      await expect(
        contract.connect(user1).submitBatchResult(batchResult1(stateIpfsHash, owner.address))
      ).to.be.revertedWithCustomError(contract, "ResultAlreadySubmitted")
    })

    it("Should fail consensus if max duration is exceeded", async () => {
      const {
        contract,
        owner,
        users: [user1, user2],
        stateIpfsHash
      } = await loadFixture(deployAndSubmitOneRequest)
      await expect(contract.connect(user1).submitBatchResult(batchResult1(stateIpfsHash, owner.address))).to.emit(
        contract,
        "BatchResultRecorded"
      )

      await time.increase(12)

      await expect(contract.connect(user2).submitBatchResult(batchResult1(stateIpfsHash, owner.address)))
        .to.emit(contract, "RequestFailed")
        .withArgs(ethers.BigNumber.from(1))
        .and.to.emit(contract, "NextBatchReady")
    })

    it("Should end consensus with success if quorum and ratio is reached", async () => {
      const {
        contract,
        owner,
        users: [user1, user2, user3, user4],
        stateIpfsHash,
        usersLastSeen
      } = await loadFixture(deployAndSubmitOneRequest)

      await expect(contract.connect(user1).submitBatchResult(batchResult1(stateIpfsHash, owner.address)))
        .to.emit(contract, "BatchResultRecorded")
        .and.not.to.emit(contract, "NextBatchReady")

      await expect(contract.connect(user2).submitBatchResult(batchResult1(stateIpfsHash, owner.address)))
        .to.emit(contract, "BatchResultRecorded")
        .and.not.to.emit(contract, "NextBatchReady")

      await expect(contract.connect(user3).submitBatchResult(batchResult1(stateIpfsHash, owner.address)))
        .to.emit(contract, "BatchResultRecorded")
        .and.to.emit(contract, "NextBatchReady")
        .and.to.emit(contract, "ResponseReceived")
        .withArgs(ethers.BigNumber.from(1))

      const latestTime = await time.latest()

      expect(await contract.connect(user1).getContributionData()).to.deep.equal(
        toStruct({
          addr: user1.address,
          stake: ethers.utils.parseEther("1"),
          contributions: 1,
          lastSeen: latestTime
        })
      )
      expect(await contract.connect(user2).getContributionData()).to.deep.equal(
        toStruct({
          addr: user2.address,
          stake: ethers.utils.parseEther("2"),
          contributions: 1,
          lastSeen: latestTime
        })
      )
      expect(await contract.connect(user3).getContributionData()).to.deep.equal(
        toStruct({
          addr: user3.address,
          stake: ethers.utils.parseEther("4"),
          contributions: 1,
          lastSeen: latestTime
        })
      )
      expect(await contract.connect(user4).getContributionData()).to.deep.equal(
        toStruct({
          addr: user4.address,
          stake: ethers.utils.parseEther("8"),
          contributions: 0,
          lastSeen: usersLastSeen[3]
        })
      )
    })

    it("Should end consensus with failure if quorum is reached but not ratio", async () => {
      const {
        contract,
        users: [user1, user2, user3, user4],
        usersLastSeen,
        stateIpfsHash,
        owner
      } = await loadFixture(deployAndSubmitOneRequest)

      await expect(contract.connect(user1).submitBatchResult(batchResult1(stateIpfsHash, owner.address)))
        .to.emit(contract, "BatchResultRecorded")
        .and.not.to.emit(contract, "NextBatchReady")

      await expect(contract.connect(user2).submitBatchResult(batchResult1(stateIpfsHash, owner.address)))
        .to.emit(contract, "BatchResultRecorded")
        .and.not.to.emit(contract, "NextBatchReady")

      await expect(contract.connect(user4).submitBatchResult(batchResult2(stateIpfsHash, owner.address)))
        .to.emit(contract, "BatchResultRecorded")
        .and.to.emit(contract, "NextBatchReady")
        .and.to.emit(contract, "RequestFailed")
        .withArgs(ethers.BigNumber.from(1))

      expect(await contract.connect(user1).getContributionData()).to.deep.equal(
        toStruct({
          addr: user1.address,
          stake: ethers.utils.parseEther("1"),
          contributions: 0,
          lastSeen: usersLastSeen[0]
        })
      )
      expect(await contract.connect(user2).getContributionData()).to.deep.equal(
        toStruct({
          addr: user2.address,
          stake: ethers.utils.parseEther("2"),
          contributions: 0,
          lastSeen: usersLastSeen[1]
        })
      )
      expect(await contract.connect(user3).getContributionData()).to.deep.equal(
        toStruct({
          addr: user3.address,
          stake: ethers.utils.parseEther("4"),
          contributions: 0,
          lastSeen: usersLastSeen[2]
        })
      )
      expect(await contract.connect(user4).getContributionData()).to.deep.equal(
        toStruct({
          addr: user4.address,
          stake: ethers.utils.parseEther("8"),
          contributions: 0,
          lastSeen: usersLastSeen[3]
        })
      )
    })
  })
})
