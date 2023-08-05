import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"
import { ethers } from "hardhat"
import { batchResult1, batchResult2, batchResult3 } from "./utils/batchResult"
import expectThatCurrentBatchHas from "./utils/expectThatCurrentBatchHas"
import { Wallet } from "ethers"

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
      consensusMaxDuration: ethers.BigNumber.from(600),
      consensusQuorumPercent: ethers.BigNumber.from(75),
      consensusRatioPercent: ethers.BigNumber.from(51),
      inactivityDuration: ethers.BigNumber.from(3600),
      housekeepReward: ethers.BigNumber.from(3),
      slashPercent: ethers.BigNumber.from(2)
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

  async function deployAndCompleteOneConsensus() {
    const fixture = await deployAndSubmitOneRequest()
    const {
      contract,
      owner,
      users: [user1, user2, user3]
    } = fixture
    await contract.sendRequest("request2") // enqueue so it is loaded in second batch
    await contract.connect(user1).submitBatchResult(batchResult1(0, owner.address))
    await contract.connect(user2).submitBatchResult(batchResult1(0, owner.address))
    await contract.connect(user3).submitBatchResult(batchResult1(0, owner.address))
    return fixture
  }

  describe("Deployment", function () {
    it("Should initialize correctly", async function () {
      const { contract, globalParams } = await loadFixture(deploy)
      expect(await contract.globalParams()).to.deep.equal(toStruct(globalParams))
    })
  })

  describe("Server registration", function () {
    it("Should register server", async () => {
      const { contract, owner, globalParams } = await loadFixture(deploy)
      await expect(contract.serverRegister({ value: ethers.utils.parseEther("1") }))
        .to.emit(contract, "ServerRegistered")
        .withArgs(owner.address)
      expect(await contract.getContributionData()).to.deep.equal(
        toStruct({
          addr: owner.address,
          stake: globalParams.minStake,
          contributions: 0,
          lastSeen: await time.latest(),
          nextHousekeepAt: ethers.BigNumber.from(await time.latest()).add(globalParams.inactivityDuration)
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

    it("Should unregister server, with a fee that go to treasury", async () => {
      const { contract, owner } = await loadFixture(deployAndRegisterOwner)
      await expect(contract.serverUnregister()).to.emit(contract, "ServerUnregistered").withArgs(owner.address)
      await expect(contract.getContributionData()).to.be.revertedWithCustomError(contract, "ServerNotRegistered")
      expect(await contract.treasury()).to.equal(ethers.utils.parseEther("0.02")) // Slashed amount go to treasury
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
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("1"))
    })

    it("Should double stake after 1 registration", async () => {
      const { contract } = await loadFixture(deployAndRegisterOwner)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("2"))
    })

    it("Should double stake again (x4) after another registration", async () => {
      const {
        contract,
        users: [user1]
      } = await loadFixture(deployAndRegisterOwner)
      await contract.connect(user1).serverRegister({ value: ethers.utils.parseEther("2") })
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("4"))
    })

    it("Should decrease stake in a linear way until a week passes, then halve every week until it goes back to minimum stake", async () => {
      const { contract } = await loadFixture(deployAndRegister4Users)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("16"))
      await time.increase(120960)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("14.4"))
      await time.increase(181440)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("12"))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("8"))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("6"))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("4"))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("3"))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("2"))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("1.5"))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("1"))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("1"))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("1"))
    })

    it("Should adjust stake correctly taking into account both new registrations and over time decrease", async () => {
      const {
        contract,
        users: [user1, user2, user3, user4]
      } = await loadFixture(deploy)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("1"))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("1"))
      await contract.connect(user1).serverRegister({ value: await contract.getStakeRequirement() })
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("2"))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("1.5"))
      await contract.connect(user2).serverRegister({ value: await contract.getStakeRequirement() })
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("3"))
      await time.increase(120960)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("2.7"))
      await contract.connect(user3).serverRegister({ value: await contract.getStakeRequirement() })
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("5.4"))
      await time.increase(6048000) // 10 weeks
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("1"))
      await contract.connect(user4).serverRegister({ value: await contract.getStakeRequirement() })
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther("2"))
    })
  })

  describe("Request submission", () => {
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
      await expect(contract.connect(user1).sendRequest("request1")).to.emit(contract, "NextBatchReady")
      await expectThatCurrentBatchHas(contract, {
        nonce: 0,
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
        contract.connect(user1).submitBatchResult(batchResult1(0, owner.address))
      ).to.be.revertedWithCustomError(contract, "ServerNotRegistered")
    })

    it("Should emit BatchResultIgnored if submitting a result from previous batch", async () => {
      const {
        contract,
        owner,
        users: [user1]
      } = await loadFixture(deployAndCompleteOneConsensus)
      await expect(contract.connect(user1).submitBatchResult(batchResult1(0, owner.address))).to.emit(
        contract,
        "BatchResultIgnored"
      )
      await expect(contract.connect(user1).submitBatchResult(batchResult1(1, owner.address))).not.to.emit(
        contract,
        "BatchResultIgnored"
      )
    })

    it("Should revert if empty batch", async () => {
      const { contract, owner } = await loadFixture(deployAndRegisterOwner)
      await expect(contract.getCurrentBatch()).to.be.revertedWithCustomError(contract, "EmptyBatch")
      await expect(contract.submitBatchResult(batchResult1(0, owner.address))).to.be.revertedWithCustomError(
        contract,
        "EmptyBatch"
      )
    })

    it("Should revert if nonce mismatches", async () => {
      const {
        contract,
        owner,
        users: [user1]
      } = await loadFixture(deployAndSubmitOneRequest)
      await expect(
        contract.connect(user1).submitBatchResult(batchResult1(42, owner.address))
      ).to.be.revertedWithCustomError(contract, "InvalidBatchNonce")
    })

    it("Should revert if attempt to submit result more than once", async () => {
      const {
        contract,
        owner,
        users: [user1]
      } = await loadFixture(deployAndSubmitOneRequest)
      await expect(contract.connect(user1).submitBatchResult(batchResult1(0, owner.address))).to.emit(
        contract,
        "BatchResultRecorded"
      )
      await expect(
        contract.connect(user1).submitBatchResult(batchResult1(0, owner.address))
      ).to.be.revertedWithCustomError(contract, "ResultAlreadySubmitted")
    })

    it("Should emit consensus expired if max duration is exceeded", async () => {
      const {
        contract,
        owner,
        users: [user1, user2]
      } = await loadFixture(deployAndSubmitOneRequest)
      await expect(contract.connect(user1).submitBatchResult(batchResult1(0, owner.address))).to.emit(
        contract,
        "BatchResultRecorded"
      )

      await time.increase(600)

      await expect(contract.connect(user2).submitBatchResult(batchResult1(0, owner.address))).to.emit(
        contract,
        "ConsensusExpired"
      )
    })

    it("Should end consensus with success if quorum and ratio is reached", async () => {
      const {
        globalParams: { inactivityDuration },
        contract,
        owner,
        users: [user1, user2, user3, user4],
        usersLastSeen
      } = await loadFixture(deployAndSubmitOneRequest)

      await expect(contract.connect(user1).submitBatchResult(batchResult1(0, owner.address)))
        .to.emit(contract, "BatchResultRecorded")
        .and.not.to.emit(contract, "ResponseReceived")

      const lastSeen1 = await time.latest()

      await expect(contract.connect(user2).submitBatchResult(batchResult1(0, owner.address)))
        .to.emit(contract, "BatchResultRecorded")
        .and.not.to.emit(contract, "ResponseReceived")

      const lastSeen2 = await time.latest()

      await expect(contract.connect(user3).submitBatchResult(batchResult1(0, owner.address)))
        .to.emit(contract, "BatchResultRecorded")
        .and.to.emit(contract, "ResponseReceived")
        .withArgs(ethers.BigNumber.from(1))

      const lastSeen3 = await time.latest()

      expect(await contract.connect(user1).getContributionData()).to.deep.equal(
        toStruct({
          addr: user1.address,
          stake: ethers.utils.parseEther("1"),
          contributions: 1,
          lastSeen: lastSeen1,
          nextHousekeepAt: ethers.BigNumber.from(usersLastSeen[0]).add(inactivityDuration)
        })
      )
      expect(await contract.connect(user2).getContributionData()).to.deep.equal(
        toStruct({
          addr: user2.address,
          stake: ethers.utils.parseEther("2"),
          contributions: 1,
          lastSeen: lastSeen2,
          nextHousekeepAt: ethers.BigNumber.from(usersLastSeen[1]).add(inactivityDuration.mul(2))
        })
      )
      expect(await contract.connect(user3).getContributionData()).to.deep.equal(
        toStruct({
          addr: user3.address,
          stake: ethers.utils.parseEther("4"),
          contributions: 1,
          lastSeen: lastSeen3,
          nextHousekeepAt: ethers.BigNumber.from(usersLastSeen[2]).add(inactivityDuration.mul(3))
        })
      )
      expect(await contract.connect(user4).getContributionData()).to.deep.equal(
        toStruct({
          addr: user4.address,
          stake: ethers.utils.parseEther("8"),
          contributions: 0,
          lastSeen: usersLastSeen[3],
          nextHousekeepAt: ethers.BigNumber.from(usersLastSeen[3]).add(inactivityDuration.mul(4))
        })
      )
    })

    it("Should slash stake from minority after consensus completed", async () => {
      const {
        globalParams: { inactivityDuration },
        contract,
        owner,
        users: [user1, user2, user3],
        usersLastSeen
      } = await loadFixture(deployAndSubmitOneRequest)

      await contract.connect(user1).submitBatchResult(batchResult1(0, owner.address))
      const lastSeen1 = await time.latest()
      await contract.connect(user2).submitBatchResult(batchResult1(0, owner.address))
      const lastSeen2 = await time.latest()
      await contract.connect(user3).submitBatchResult(batchResult2(0, owner.address))
      const lastSeen3 = await time.latest()

      expect(await contract.connect(user1).getContributionData()).to.deep.equal(
        toStruct({
          addr: user1.address,
          stake: ethers.utils.parseEther("1"),
          contributions: 1,
          lastSeen: lastSeen1,
          nextHousekeepAt: ethers.BigNumber.from(usersLastSeen[0]).add(inactivityDuration)
        })
      )
      expect(await contract.connect(user2).getContributionData()).to.deep.equal(
        toStruct({
          addr: user2.address,
          stake: ethers.utils.parseEther("2"),
          contributions: 1,
          lastSeen: lastSeen2,
          nextHousekeepAt: ethers.BigNumber.from(usersLastSeen[1]).add(inactivityDuration.mul(2))
        })
      )
      expect(await contract.connect(user3).getContributionData()).to.deep.equal(
        toStruct({
          addr: user3.address,
          stake: ethers.utils.parseEther("3.92"),
          contributions: 0,
          lastSeen: lastSeen3,
          nextHousekeepAt: ethers.BigNumber.from(usersLastSeen[2]).add(inactivityDuration.mul(3))
        })
      )
      expect(await contract.treasury()).to.equal(ethers.utils.parseEther("0.08"))
    })

    it("Should slash stake from minority and unregister user if remaining stake is below minimum", async () => {
      const {
        globalParams: { inactivityDuration },
        contract,
        owner,
        users: [user1, user2, user3],
        usersLastSeen
      } = await loadFixture(deployAndSubmitOneRequest)

      await contract.connect(user1).submitBatchResult(batchResult2(0, owner.address))
      await contract.connect(user2).submitBatchResult(batchResult1(0, owner.address))
      const lastSeen2 = await time.latest()
      await expect(contract.connect(user3).submitBatchResult(batchResult1(0, owner.address)))
        .to.emit(contract, "ServerUnregistered")
        .withArgs(user1.address)
      const lastSeen3 = await time.latest()

      await expect(contract.connect(user1).getContributionData()).to.be.revertedWithCustomError(
        contract,
        "ServerNotRegistered"
      )
      expect(await contract.connect(user2).getContributionData()).to.deep.equal(
        toStruct({
          addr: user2.address,
          stake: ethers.utils.parseEther("2"),
          contributions: 1,
          lastSeen: lastSeen2,
          nextHousekeepAt: ethers.BigNumber.from(usersLastSeen[1]).add(inactivityDuration.mul(2))
        })
      )
      expect(await contract.connect(user3).getContributionData()).to.deep.equal(
        toStruct({
          addr: user3.address,
          stake: ethers.utils.parseEther("4"),
          contributions: 1,
          lastSeen: lastSeen3,
          nextHousekeepAt: ethers.BigNumber.from(usersLastSeen[2]).add(inactivityDuration.mul(3))
        })
      )
      expect(await contract.treasury()).to.equal(ethers.utils.parseEther("0.02"))
    })

    it("Should end consensus with failure if quorum is reached but not ratio", async () => {
      const {
        contract,
        globalParams: { inactivityDuration },
        users: [user1, user2, user3, user4],
        usersLastSeen,
        owner
      } = await loadFixture(deployAndSubmitOneRequest)

      await expect(contract.connect(user1).submitBatchResult(batchResult1(0, owner.address)))
        .to.emit(contract, "BatchResultRecorded")
        .and.not.to.emit(contract, "RequestFailed")

      const lastSeen1 = await time.latest()

      await expect(contract.connect(user2).submitBatchResult(batchResult2(0, owner.address)))
        .to.emit(contract, "BatchResultRecorded")
        .and.not.to.emit(contract, "RequestFailed")

      const lastSeen2 = await time.latest()

      await expect(contract.connect(user4).submitBatchResult(batchResult3(0, owner.address)))
        .to.emit(contract, "BatchResultRecorded")
        .and.to.emit(contract, "RequestFailed")
        .withArgs(ethers.BigNumber.from(1))

      const lastSeen4 = await time.latest()

      expect(await contract.connect(user1).getContributionData()).to.deep.equal(
        toStruct({
          addr: user1.address,
          stake: ethers.utils.parseEther("1"),
          contributions: 0,
          lastSeen: lastSeen1,
          nextHousekeepAt: ethers.BigNumber.from(usersLastSeen[0]).add(inactivityDuration)
        })
      )
      expect(await contract.connect(user2).getContributionData()).to.deep.equal(
        toStruct({
          addr: user2.address,
          stake: ethers.utils.parseEther("2"),
          contributions: 0,
          lastSeen: lastSeen2,
          nextHousekeepAt: ethers.BigNumber.from(usersLastSeen[1]).add(inactivityDuration.mul(2))
        })
      )
      expect(await contract.connect(user3).getContributionData()).to.deep.equal(
        toStruct({
          addr: user3.address,
          stake: ethers.utils.parseEther("4"),
          contributions: 0,
          lastSeen: usersLastSeen[2],
          nextHousekeepAt: ethers.BigNumber.from(usersLastSeen[2]).add(inactivityDuration.mul(3))
        })
      )
      expect(await contract.connect(user4).getContributionData()).to.deep.equal(
        toStruct({
          addr: user4.address,
          stake: ethers.utils.parseEther("8"),
          contributions: 0,
          lastSeen: lastSeen4,
          nextHousekeepAt: ethers.BigNumber.from(usersLastSeen[3]).add(inactivityDuration.mul(4))
        })
      )
    })

    it("Should next batch be empty", async () => {
      const {
        contract,
        owner,
        users: [user1, user2, user3]
      } = await deployAndSubmitOneRequest()
      await contract.connect(user1).submitBatchResult(batchResult1(0, owner.address))
      await contract.connect(user2).submitBatchResult(batchResult1(0, owner.address))
      await expect(contract.connect(user3).submitBatchResult(batchResult1(0, owner.address))).not.to.emit(
        contract,
        "NextBatchReady"
      )

      await expect(contract.connect(user1).getCurrentBatch()).to.be.revertedWithCustomError(contract, "EmptyBatch")
    })

    it("Should next batch contain request2", async () => {
      const {
        contract,
        owner,
        users: [user1]
      } = await deployAndCompleteOneConsensus()

      await expectThatCurrentBatchHas(contract.connect(user1), {
        nonce: 1,
        stateIpfsHash: "finalFooBar1",
        sizeOf: 1,
        requests: [
          toStruct({
            nonce: ethers.BigNumber.from(2),
            ipfsHash: "request2",
            currentTime: ethers.BigNumber.from(await time.latest()),
            author: owner.address
          })
        ]
      })
    })
  })

  describe("Batch skipping and housekeeping", () => {
    it("Should revert if non-registered user call housekeep methods", async () => {
      const {
        contract,
        users: [user1]
      } = await loadFixture(deployAndRegisterOwner)
      await expect(contract.connect(user1).skipBatchIfConsensusExpired()).to.be.revertedWithCustomError(
        contract,
        "ServerNotRegistered"
      )
      await expect(contract.connect(user1).housekeepInactive()).to.be.revertedWithCustomError(
        contract,
        "ServerNotRegistered"
      )
    })

    it("Should emit BatchSkipped if current batch has expired, NoActionTaken otherwise", async () => {
      const {
        contract,
        owner,
        users: [user1, user2]
      } = await loadFixture(deployAndSubmitOneRequest)
      await expect(contract.connect(user1).submitBatchResult(batchResult1(0, owner.address))).to.emit(
        contract,
        "BatchResultRecorded"
      )

      await expect(contract.connect(user2).skipBatchIfConsensusExpired()).to.emit(contract, "NoActionTaken")

      await time.increase(12)

      await expect(contract.connect(user2).skipBatchIfConsensusExpired()).to.emit(contract, "BatchSkipped")
    })

    it("Should revert if housekeep is on cooldown", async () => {
      const { contract } = await loadFixture(deployAndRegisterOwner)
      await expect(contract.housekeepInactive()).to.be.revertedWithCustomError(contract, "HousekeepCooldown")
    })

    it("Should emit HousekeepSuccess but should not unregister the caller", async () => {
      const { contract, globalParams } = await loadFixture(deployAndRegisterOwner)
      await time.increase(globalParams.inactivityDuration)
      await expect(contract.housekeepInactive())
        .to.emit(contract, "HousekeepSuccess")
        .and.not.to.emit(contract, "ServerUnregistered")
    })

    it("Should emit HousekeepSuccess and unregister user4", async () => {
      const {
        contract,
        owner,
        users: [user1, user2, user3, user4]
      } = await loadFixture(deployAndSubmitOneRequest)
      // Complete a batch
      await contract.connect(user1).submitBatchResult(batchResult1(0, owner.address))
      await contract.connect(user2).submitBatchResult(batchResult1(0, owner.address))
      await contract.connect(user3).submitBatchResult(batchResult1(0, owner.address))

      await time.increase(2000)

      // Complete another batch a few moments later
      await contract.sendRequest("request2")
      await contract.connect(user1).submitBatchResult(batchResult2(1, owner.address))
      await contract.connect(user2).submitBatchResult(batchResult2(1, owner.address))
      await contract.connect(user3).submitBatchResult(batchResult2(1, owner.address))

      await time.increase(2000)

      await expect(contract.connect(user1).housekeepInactive())
        .to.emit(contract, "HousekeepSuccess")
        .and.to.emit(contract, "ServerUnregistered")
        .withArgs(user4.address)

      expect(await contract.getServerCount()).to.equal(ethers.BigNumber.from(3))

      expect(await contract.treasury()).to.equal(ethers.utils.parseEther("0.16"))
    })
  })

  describe("Rewards distribution", () => {
    it("Should distribute rewards according to contribution points", async () => {
      const {
        contract,
        owner,
        users: [user1, user2, user3, user4]
      } = await loadFixture(deployAndSubmitOneRequest)

      await time.increase(50)

      // user 1 will skip an expired batch in order to get a contribution point
      await contract.connect(user1).skipBatchIfConsensusExpired()

      // users 1, 2 and 3 will get a contribution point by completing next batch
      await contract.sendRequest("request2")
      await contract.connect(user1).submitBatchResult(batchResult1(1, owner.address))
      await contract.connect(user2).submitBatchResult(batchResult1(1, owner.address))
      await contract.connect(user3).submitBatchResult(batchResult1(1, owner.address))

      await time.increase(10000)

      // User 2 will get 3 contribution points for housekeeping
      await contract.sendRequest("request3")
      await contract.connect(user1).submitBatchResult(batchResult2(2, owner.address))
      await contract.connect(user2).submitBatchResult(batchResult2(2, owner.address))
      await contract.connect(user3).submitBatchResult(batchResult2(2, owner.address))
      await contract.connect(user2).housekeepInactive()

      expect((await contract.connect(user1).getContributionData()).contributions).to.equal(3)
      expect((await contract.connect(user2).getContributionData()).contributions).to.equal(5)
      expect((await contract.connect(user3).getContributionData()).contributions).to.equal(2)

      // there's already 0.16 ether in treasury because of user4 housekeeping
      await contract.donateToTreasury({ value: ethers.utils.parseEther("249.84") })

      expect(await contract.treasury()).to.equal(ethers.utils.parseEther("250"))
      expect(await contract.connect(user1).getClaimableRewards()).to.equal(ethers.utils.parseEther("75"))
      expect(await contract.connect(user2).getClaimableRewards()).to.equal(ethers.utils.parseEther("125"))
      expect(await contract.connect(user3).getClaimableRewards()).to.equal(ethers.utils.parseEther("50"))

      await contract.connect(user1).claimRewards()

      expect(await contract.treasury()).to.equal(ethers.utils.parseEther("175"))
      expect(await contract.connect(user1).getClaimableRewards()).to.equal(ethers.utils.parseEther("0"))
      expect(await contract.connect(user2).getClaimableRewards()).to.equal(ethers.utils.parseEther("125"))
      expect(await contract.connect(user3).getClaimableRewards()).to.equal(ethers.utils.parseEther("50"))

      await contract.connect(user2).claimRewards()

      expect(await contract.treasury()).to.equal(ethers.utils.parseEther("50"))
      expect(await contract.connect(user1).getClaimableRewards()).to.equal(ethers.utils.parseEther("0"))
      expect(await contract.connect(user2).getClaimableRewards()).to.equal(ethers.utils.parseEther("0"))
      expect(await contract.connect(user3).getClaimableRewards()).to.equal(ethers.utils.parseEther("50"))

      await contract.connect(user3).claimRewards()

      expect(await contract.treasury()).to.equal(ethers.utils.parseEther("0"))
      expect(await contract.connect(user1).getClaimableRewards()).to.equal(ethers.utils.parseEther("0"))
      expect(await contract.connect(user2).getClaimableRewards()).to.equal(ethers.utils.parseEther("0"))
      expect(await contract.connect(user3).getClaimableRewards()).to.equal(ethers.utils.parseEther("0"))
    })
  })

  describe("Gas limit performance tests", () => {
    async function playScenario(servers: number, requestsPerBatch: number) {
      const { contract, owner } = await loadFixture(deploy)
      const wallets: Wallet[] = []
      for (let i = 0; i < servers; i++) {
        const wallet = ethers.Wallet.createRandom().connect(ethers.provider)
        await owner.sendTransaction({ to: wallet.address, value: ethers.utils.parseEther("20") })
        wallets.push(wallet)
        await contract.connect(wallet).serverRegister({ value: ethers.utils.parseEther("1") })
        await time.increase(604800)
      }
      expect(await contract.getServerCount()).to.equal(servers)
      console.log("Registered %d servers", servers)
      await time.increase(3600)

      let requestId = 0

      async function sendRequest() {
        const id = `request_${++requestId}`
        await contract.sendRequest(id)
        console.log("Sent %s", id)
      }

      // First requests initializes a batch of 1
      const promises = []
      for (let i = 0; i < requestsPerBatch + 1; i++) {
        promises.push(sendRequest())
      }
      await Promise.allSettled(promises)

      const batchNonce = (await contract.connect(wallets[0]).getCurrentBatch()).nonce.toNumber()
      await Promise.allSettled(
        wallets.map(async (wallet, i) => {
          await contract.connect(wallet).submitBatchResult(batchResult1(batchNonce, owner.address))
          console.log("Wallet %d submitted result for batch %d", i, batchNonce)
        })
      )

      await contract.connect(wallets[0]).housekeepInactive()
      expect(await contract.getServerCount()).to.equal(Math.floor(servers * 0.75))
    }

    it.only("Should handle 50 servers and 500 requests per batch without exploding gas limit", async () => {
      await playScenario(50, 500)
    })

    it("Should handle 300 servers and 6000 requests per batch without exploding gas limit", async () => {
      await playScenario(300, 6000)
    })
  })
})
