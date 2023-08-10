import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"
import { ethers } from "hardhat"
import { batchResult1, batchResult2, batchResult3 } from "../src/utils/batchResult"
import expectThatCurrentBatchHas from "../src/utils/expectThatCurrentBatchHas"
import { Wallet, Contract, Signer } from "ethers"
import multihash from "../src/utils/multihash"

function toStruct<T extends object>(obj: T): T {
  return Object.assign(Object.values(obj), obj)
}

async function registerManyWallets(contract: Contract, owner: Signer, count: number): Promise<Wallet[]> {
  const wallets: Wallet[] = []
  for (let i = 0; i < count; i++) {
    const wallet = ethers.Wallet.createRandom().connect(ethers.provider)
    await owner.sendTransaction({ to: wallet.address, value: ethers.utils.parseEther("20") })
    wallets.push(wallet)
    await contract.connect(wallet).serverRegister({ value: ethers.utils.parseEther("1") })
    process.stdout.write(`\rWallet ${i + 1}/${count} registered`)
    await time.increase(604800)
  }
  console.log()
  return wallets
}

describe("REST3App", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deploy(globalParamsOverrides?: object) {
    // Contracts are deployed using the first signer/account by default
    const [owner, ...users] = await ethers.getSigners()

    const REST3App = await ethers.getContractFactory("REST3App")
    const globalParams = {
      defaultRequestCost: ethers.BigNumber.from(1),
      minStake: ethers.utils.parseEther("1"),
      consensusMaxDuration: ethers.BigNumber.from(60),
      consensusQuorumPercent: ethers.BigNumber.from(75),
      consensusRatioPercent: ethers.BigNumber.from(51),
      inactivityDuration: ethers.BigNumber.from(3600),
      slashPercent: ethers.BigNumber.from(2),
      housekeepReward: ethers.BigNumber.from(3),
      revealReward: ethers.BigNumber.from(5),
      randomBackoffMin: ethers.BigNumber.from(6),
      randomBackoffMax: ethers.BigNumber.from(24),
      ...globalParamsOverrides
    }
    const stateIpfsHash = multihash.parse("QmWBaeu6y1zEcKbsEqCuhuDHPL3W8pZouCPdafMCRCSUWk")
    const contract = await REST3App.deploy(globalParams, stateIpfsHash)

    return { contract, globalParams, stateIpfsHash, owner, users }
  }

  async function deployAndRegisterOwner() {
    const fixture = await deploy()
    await fixture.contract.serverRegister({ value: ethers.utils.parseEther("1") })
    return fixture
  }

  async function deployAndRegister4Users(globalParamsOverrides?: object) {
    const fixture = await deploy(globalParamsOverrides)
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
    return { ...fixture, usersLastSeen, usersRegisteredAt: usersLastSeen.slice() }
  }

  async function deployAndRegister200Users() {
    const fixture = await deploy({ consensusMaxDuration: ethers.BigNumber.from(9999) })
    const { contract, owner } = fixture
    const wallets = await registerManyWallets(contract, owner, 200)
    return { ...fixture, wallets }
  }

  async function deployAndSubmitOneRequest(globalParamsOverrides?: object) {
    const fixture = await deployAndRegister4Users(globalParamsOverrides)
    const { contract } = fixture
    await contract.sendRequest(multihash.generate("request1"))
    return fixture
  }

  async function deployAndReachConsensus(globalParamsOverrides?: object) {
    const fixture = await deployAndSubmitOneRequest(globalParamsOverrides)
    const {
      contract,
      users: [user1, user2, user3],
      usersLastSeen
    } = fixture
    const result = batchResult1(1)
    const result2 = batchResult2(1)
    await contract.connect(user1).submitBatchResultHash(1, await contract.hashResult(result))
    usersLastSeen[0] = await time.latest()
    await contract.connect(user2).submitBatchResultHash(1, await contract.hashResult(result))
    usersLastSeen[1] = await time.latest()
    await contract.connect(user3).submitBatchResultHash(1, await contract.hashResult(result2))
    usersLastSeen[2] = await time.latest()
    return fixture
  }

  async function deployAndCompleteOneConsensus(globalParamsOverrides?: object) {
    const fixture = await deployAndReachConsensus(globalParamsOverrides)
    const {
      contract,
      users: [user1],
      globalParams,
      usersLastSeen
    } = fixture
    const result = batchResult1(1)
    await contract.sendRequest(multihash.generate("request2")) // enqueue so it is loaded in second batch
    await time.increase(globalParams.randomBackoffMax)
    await contract.connect(user1).revealBatchResult(result)
    usersLastSeen[0] = await time.latest()
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

    it("Should not register server, max reached", async () => {
      const { contract } = await loadFixture(deployAndRegister200Users)
      await expect(contract.serverRegister({ value: ethers.utils.parseEther("2") })).to.be.revertedWithCustomError(
        contract,
        "MaxServersReached"
      )
    }).timeout(120000)

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
      await expect(contract.connect(user1).sendRequest(multihash.generate("request1"))).to.emit(
        contract,
        "NextBatchReady"
      )
      await expectThatCurrentBatchHas(contract, {
        nonce: 1,
        stateIpfsHash,
        sizeOf: 1,
        requests: [
          toStruct({
            author: user1.address,
            ipfsHash: toStruct(multihash.generate("request1"))
          })
        ]
      })
    })

    it("Should enqueue subsequent requests", async () => {
      const {
        contract,
        owner,
        users: [user1],
        stateIpfsHash
      } = await loadFixture(deployAndSubmitOneRequest)

      await contract.sendRequest(multihash.generate("request2"))
      // request2 should be only in queue, not in batch
      await expectThatCurrentBatchHas(contract.connect(user1), {
        stateIpfsHash,
        sizeOf: 1,
        requests: [
          toStruct({
            author: owner.address,
            ipfsHash: toStruct(multihash.generate("request1"))
          })
        ]
      })
    })
  })

  describe("Batch result submissions", () => {
    it("Should revert if not registered", async () => {
      const {
        contract,
        users: [user1]
      } = await loadFixture(deployAndRegisterOwner)
      const result = batchResult1(0)

      await expect(contract.connect(user1).getCurrentBatch()).to.be.revertedWithCustomError(
        contract,
        "ServerNotRegistered"
      )
      await expect(
        contract.connect(user1).submitBatchResultHash(0, await contract.hashResult(result))
      ).to.be.revertedWithCustomError(contract, "ServerNotRegistered")
      await expect(contract.connect(user1).revealBatchResult(result)).to.be.revertedWithCustomError(
        contract,
        "ServerNotRegistered"
      )
      await expect(contract.connect(user1).getResultRevealTimestamp(0)).to.be.revertedWithCustomError(
        contract,
        "ServerNotRegistered"
      )
      await expect(contract.connect(user1).getContributionData()).to.be.revertedWithCustomError(
        contract,
        "ServerNotRegistered"
      )
      await expect(contract.connect(user1).skipBatchIfConsensusExpired()).to.be.revertedWithCustomError(
        contract,
        "ServerNotRegistered"
      )
      await expect(contract.connect(user1).housekeepInactive()).to.be.revertedWithCustomError(
        contract,
        "ServerNotRegistered"
      )
      await expect(contract.connect(user1).getClaimableRewards()).to.be.revertedWithCustomError(
        contract,
        "ServerNotRegistered"
      )
      await expect(contract.connect(user1).claimRewards()).to.be.revertedWithCustomError(
        contract,
        "ServerNotRegistered"
      )
    })

    it("Should revert if current batch is empty", async () => {
      const { contract } = await loadFixture(deployAndRegisterOwner)
      await expect(contract.getCurrentBatch()).to.be.revertedWithCustomError(contract, "EmptyBatch")
    })

    it("Should revert if nonce is invalid", async () => {
      const { contract } = await loadFixture(deployAndRegisterOwner)
      await expect(
        contract.submitBatchResultHash(42, await contract.hashResult(batchResult1(42)))
      ).to.be.revertedWithCustomError(contract, "InvalidBatchNonce")
      await expect(contract.revealBatchResult(batchResult1(42))).to.be.revertedWithCustomError(
        contract,
        "InvalidBatchNonce"
      )
      await expect(contract.getResultRevealTimestamp(42)).to.be.revertedWithCustomError(contract, "InvalidBatchNonce")
    })

    it("Should revert if consensus not active", async () => {
      const { contract } = await loadFixture(deployAndRegisterOwner)
      await expect(
        contract.submitBatchResultHash(0, await contract.hashResult(batchResult1(0)))
      ).to.be.revertedWithCustomError(contract, "ConsensusNotActive")
      await expect(contract.revealBatchResult(batchResult1(0))).to.be.revertedWithCustomError(
        contract,
        "ConsensusNotActive"
      )
      await expect(contract.getResultRevealTimestamp(0)).to.be.revertedWithCustomError(contract, "ConsensusNotActive")
    })

    it("Should revert if attempt to submit result more than once", async () => {
      const {
        contract,
        users: [user1]
      } = await loadFixture(deployAndSubmitOneRequest)
      await expect(
        contract.connect(user1).submitBatchResultHash(1, await contract.hashResult(batchResult1(1)))
      ).to.emit(contract, "BatchResultHashSubmitted")
      await expect(
        contract.connect(user1).submitBatchResultHash(1, await contract.hashResult(batchResult1(1)))
      ).to.be.revertedWithCustomError(contract, "ResultAlreadySubmitted")
    })

    it("Should revert if consensus expired", async () => {
      const {
        contract,
        users: [user1, user2],
        globalParams
      } = await loadFixture(deployAndSubmitOneRequest)

      await expect(
        contract.connect(user1).submitBatchResultHash(1, await contract.hashResult(batchResult1(1)))
      ).to.emit(contract, "BatchResultHashSubmitted")

      await time.increase(globalParams.consensusMaxDuration)

      await expect(
        contract.connect(user2).submitBatchResultHash(1, await contract.hashResult(batchResult1(1)))
      ).to.be.revertedWithCustomError(contract, "ConsensusNotActive")
    })

    it("Should emit ConsensusReached if quorum and ratio is reached", async () => {
      const {
        contract,
        users: [user1, user2, user3]
      } = await loadFixture(deployAndSubmitOneRequest)

      const result = batchResult1(1)
      const resultHash = await contract.hashResult(result)

      await expect(contract.connect(user1).submitBatchResultHash(1, resultHash))
        .to.emit(contract, "BatchResultHashSubmitted")
        .and.not.to.emit(contract, "ConsensusReached")
        .and.not.to.emit(contract, "BatchFailed")

      await expect(contract.connect(user2).submitBatchResultHash(1, resultHash))
        .to.emit(contract, "BatchResultHashSubmitted")
        .and.not.to.emit(contract, "ConsensusReached")
        .and.not.to.emit(contract, "BatchFailed")

      await expect(contract.connect(user3).submitBatchResultHash(1, resultHash))
        .to.emit(contract, "BatchResultHashSubmitted")
        .and.to.emit(contract, "ConsensusReached")
        .withArgs(resultHash)
        .and.not.to.emit(contract, "BatchFailed")
    })

    it("Should complete batch and process contributions when result is revealed", async () => {
      const {
        globalParams: { inactivityDuration, revealReward, randomBackoffMax },
        contract,
        users: [user1, user2, user3],
        usersLastSeen,
        usersRegisteredAt
      } = await loadFixture(deployAndReachConsensus)

      await time.increase(randomBackoffMax)
      expect(await contract.connect(user1).revealBatchResult(batchResult1(1))).to.emit(contract, "BatchCompleted")
      usersLastSeen[0] = await time.latest()

      expect(await contract.connect(user1).getContributionData()).to.deep.equal(
        toStruct({
          addr: user1.address,
          stake: ethers.utils.parseEther("1"),
          contributions: revealReward.add(1),
          lastSeen: usersLastSeen[0],
          nextHousekeepAt: ethers.BigNumber.from(usersRegisteredAt[0]).add(inactivityDuration)
        })
      )
      expect(await contract.connect(user2).getContributionData()).to.deep.equal(
        toStruct({
          addr: user2.address,
          stake: ethers.utils.parseEther("2"),
          contributions: 1,
          lastSeen: usersLastSeen[1],
          nextHousekeepAt: ethers.BigNumber.from(usersRegisteredAt[1]).add(inactivityDuration.mul(2))
        })
      )
      expect(await contract.connect(user3).getContributionData()).to.deep.equal(
        toStruct({
          addr: user3.address,
          stake: ethers.utils.parseEther("3.92"),
          contributions: 0,
          lastSeen: usersLastSeen[2],
          nextHousekeepAt: ethers.BigNumber.from(usersRegisteredAt[2]).add(inactivityDuration.mul(3))
        })
      )
      expect(await contract.treasury()).to.equal(ethers.utils.parseEther("0.08"))
    })

    it("Should unregister user after slashing if remaining stake is below minimum", async () => {
      const {
        contract,
        users: [user1, user2, user3],
        usersLastSeen,
        globalParams
      } = await loadFixture(deployAndSubmitOneRequest)
      const result = batchResult1(1)
      const result2 = batchResult2(1)
      await contract.connect(user1).submitBatchResultHash(1, await contract.hashResult(result2))
      usersLastSeen[0] = await time.latest()
      await contract.connect(user2).submitBatchResultHash(1, await contract.hashResult(result))
      usersLastSeen[1] = await time.latest()
      await contract.connect(user3).submitBatchResultHash(1, await contract.hashResult(result))
      usersLastSeen[2] = await time.latest()
      await time.increase(globalParams.randomBackoffMax)
      await expect(contract.connect(user2).revealBatchResult(result)).to.emit(contract, "ServerUnregistered")
      usersLastSeen[1] = await time.latest()

      await expect(contract.connect(user1).getContributionData()).to.be.revertedWithCustomError(
        contract,
        "ServerNotRegistered"
      )
      expect(await contract.treasury()).to.equal(ethers.utils.parseEther("0.02"))
    })

    it("Should emit BatchFailed if quorum is reached but not ratio", async () => {
      const {
        contract,
        users: [user1, user2, user3]
      } = await loadFixture(deployAndSubmitOneRequest)

      await expect(contract.connect(user1).submitBatchResultHash(1, await contract.hashResult(batchResult1(1))))
        .to.emit(contract, "BatchResultHashSubmitted")
        .and.not.to.emit(contract, "ConsensusReached")
        .and.not.to.emit(contract, "BatchFailed")

      await expect(contract.connect(user2).submitBatchResultHash(1, await contract.hashResult(batchResult2(1))))
        .to.emit(contract, "BatchResultHashSubmitted")
        .and.not.to.emit(contract, "ConsensusReached")
        .and.not.to.emit(contract, "BatchFailed")

      await expect(contract.connect(user3).submitBatchResultHash(1, await contract.hashResult(batchResult3(1))))
        .to.emit(contract, "BatchResultHashSubmitted")
        .and.to.emit(contract, "BatchFailed")
        .withArgs(ethers.BigNumber.from(1))
        .and.not.to.emit(contract, "ConsensusReached")
    })

    it("Should revert with ConsensusNotActive after result has been revealed", async () => {
      const {
        contract,
        users: [, , , user4]
      } = await loadFixture(deployAndCompleteOneConsensus)
      await expect(
        contract.connect(user4).submitBatchResultHash(1, await contract.hashResult(batchResult1(1)))
      ).to.be.revertedWithCustomError(contract, "ConsensusNotActive")
    })

    it("Should reject further hash submissions after a BatchFailed", async () => {
      const {
        contract,
        users: [user1, user2, user3, user4]
      } = await loadFixture(deployAndSubmitOneRequest)

      await contract.connect(user1).submitBatchResultHash(1, await contract.hashResult(batchResult1(1)))
      await contract.connect(user2).submitBatchResultHash(1, await contract.hashResult(batchResult2(1)))
      await expect(contract.connect(user3).submitBatchResultHash(1, await contract.hashResult(batchResult3(1))))
        .to.emit(contract, "BatchFailed")
        .withArgs(ethers.BigNumber.from(1))

      await expect(
        contract.connect(user4).submitBatchResultHash(1, await contract.hashResult(batchResult1(1)))
      ).to.be.revertedWithCustomError(contract, "ConsensusNotActive")
    })

    it("Should next batch be empty", async () => {
      const {
        globalParams: { randomBackoffMax },
        contract,
        users: [user1]
      } = await loadFixture(deployAndReachConsensus)

      await time.increase(randomBackoffMax)

      await expect(contract.connect(user1).revealBatchResult(batchResult1(1)))
        .to.emit(contract, "BatchCompleted")
        .and.not.to.emit(contract, "NextBatchReady")

      await expect(contract.connect(user1).getCurrentBatch()).to.be.revertedWithCustomError(contract, "EmptyBatch")
    })

    it("Should next batch contain request2", async () => {
      const {
        contract,
        owner,
        users: [user1]
      } = await loadFixture(deployAndCompleteOneConsensus)

      await expectThatCurrentBatchHas(contract.connect(user1), {
        nonce: 2,
        stateIpfsHash: multihash.generate("1"),
        sizeOf: 1,
        requests: [
          toStruct({
            author: owner.address,
            ipfsHash: toStruct(multihash.generate("request2"))
          })
        ]
      })
    })
  })

  describe("Batch skipping and housekeeping", () => {
    it("Should emit BatchFailed and give a contribution point if current batch has expired", async () => {
      const {
        contract,
        users: [user1, user2],
        globalParams: { consensusMaxDuration }
      } = await loadFixture(deployAndSubmitOneRequest)

      await expect(
        contract.connect(user1).submitBatchResultHash(1, await contract.hashResult(batchResult1(1)))
      ).to.emit(contract, "BatchResultHashSubmitted")

      await expect(contract.connect(user2).skipBatchIfConsensusExpired()).not.to.emit(contract, "BatchFailed")
      expect((await contract.connect(user2).getContributionData()).contributions).to.equal(0)

      await time.increase(consensusMaxDuration)

      await expect(contract.connect(user2).skipBatchIfConsensusExpired()).to.emit(contract, "BatchFailed")
      expect((await contract.connect(user2).getContributionData()).contributions).to.equal(1)
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
        globalParams: { inactivityDuration },
        users: [user1, user2, user3, user4]
      } = await deployAndCompleteOneConsensus({ consensusMaxDuration: ethers.BigNumber.from(9999) })

      await time.increase(inactivityDuration)
      await contract.connect(user1).submitBatchResultHash(2, await contract.hashResult(batchResult2(2)))
      await contract.connect(user2).submitBatchResultHash(2, await contract.hashResult(batchResult2(2)))
      await contract.connect(user3).submitBatchResultHash(2, await contract.hashResult(batchResult2(2)))

      await expect(contract.connect(user1).housekeepInactive())
        .to.emit(contract, "HousekeepSuccess")
        .and.to.emit(contract, "ServerUnregistered")
        .withArgs(user4.address)

      expect(await contract.getServerCount()).to.equal(3)

      // user4 was slashed 0.16 because of inactivity, user3 was slashed 0.08 because
      // they submitted wrong result in the fixture
      expect(await contract.treasury()).to.equal(ethers.utils.parseEther("0.24"))
    })
  })

  describe("Rewards distribution", () => {
    it("Should distribute rewards according to contribution points", async () => {
      const {
        contract,
        users: [user1, user2, user3],
        globalParams: { consensusMaxDuration, randomBackoffMax, inactivityDuration }
      } = await deployAndSubmitOneRequest({ consensusMaxDuration: ethers.BigNumber.from(9999) })

      await time.increase(consensusMaxDuration.add(1))

      // user 1 will skip an expired batch in order to get a contribution point
      await contract.connect(user1).skipBatchIfConsensusExpired()

      // users 1, 2 and 3 will get a contribution point by completing next batch
      // user 2 will get extra points for revealing the result
      await expect(contract.sendRequest(multihash.generate("request2"))).to.emit(contract, "NextBatchReady")
      await contract.connect(user1).submitBatchResultHash(2, await contract.hashResult(batchResult2(2)))
      await contract.connect(user2).submitBatchResultHash(2, await contract.hashResult(batchResult2(2)))
      await contract.connect(user3).submitBatchResultHash(2, await contract.hashResult(batchResult2(2)))
      await time.increase(randomBackoffMax)
      await contract.connect(user2).revealBatchResult(batchResult2(2))

      // Elapse time so user3 can housekeep
      await time.increase(inactivityDuration.mul(3))

      // users 1, 2 and 3 will get a contribution point by completing next batch
      // User 3 will get extra points for housekeeping
      await expect(contract.sendRequest(multihash.generate("request3"))).to.emit(contract, "NextBatchReady")
      await contract.connect(user1).submitBatchResultHash(3, await contract.hashResult(batchResult3(3)))
      await contract.connect(user2).submitBatchResultHash(3, await contract.hashResult(batchResult3(3)))
      await contract.connect(user3).submitBatchResultHash(3, await contract.hashResult(batchResult3(3)))
      await time.increase(randomBackoffMax)
      await contract.connect(user2).revealBatchResult(batchResult3(3))
      await contract.connect(user3).housekeepInactive()

      expect((await contract.connect(user1).getContributionData()).contributions).to.equal(3)
      expect((await contract.connect(user2).getContributionData()).contributions).to.equal(12)
      expect((await contract.connect(user3).getContributionData()).contributions).to.equal(5)

      // there's already 0.16 ether in treasury because of user4 housekeeping
      await contract.donateToTreasury({ value: ethers.utils.parseEther("399.84") })

      expect(await contract.treasury()).to.equal(ethers.utils.parseEther("400"))
      expect(await contract.connect(user1).getClaimableRewards()).to.equal(ethers.utils.parseEther("60"))
      expect(await contract.connect(user2).getClaimableRewards()).to.equal(ethers.utils.parseEther("240"))
      expect(await contract.connect(user3).getClaimableRewards()).to.equal(ethers.utils.parseEther("100"))

      await contract.connect(user1).claimRewards()

      expect(await contract.treasury()).to.equal(ethers.utils.parseEther("340"))
      expect(await contract.connect(user1).getClaimableRewards()).to.equal(ethers.utils.parseEther("0"))
      expect(await contract.connect(user2).getClaimableRewards()).to.equal(ethers.utils.parseEther("240"))
      expect(await contract.connect(user3).getClaimableRewards()).to.equal(ethers.utils.parseEther("100"))

      await contract.connect(user2).claimRewards()

      expect(await contract.treasury()).to.equal(ethers.utils.parseEther("100"))
      expect(await contract.connect(user1).getClaimableRewards()).to.equal(ethers.utils.parseEther("0"))
      expect(await contract.connect(user2).getClaimableRewards()).to.equal(ethers.utils.parseEther("0"))
      expect(await contract.connect(user3).getClaimableRewards()).to.equal(ethers.utils.parseEther("100"))

      await contract.connect(user3).claimRewards()

      expect(await contract.treasury()).to.equal(ethers.utils.parseEther("0"))
      expect(await contract.connect(user1).getClaimableRewards()).to.equal(ethers.utils.parseEther("0"))
      expect(await contract.connect(user2).getClaimableRewards()).to.equal(ethers.utils.parseEther("0"))
      expect(await contract.connect(user3).getClaimableRewards()).to.equal(ethers.utils.parseEther("0"))
    })
  })

  describe("Gas limit performance tests", () => {
    async function playScenario(requestsPerBatch: number) {
      const {
        contract,
        wallets,
        globalParams: { randomBackoffMax }
      } = await loadFixture(deployAndRegister200Users)
      expect(await contract.getServerCount()).to.equal(200)
      console.log("Registered 200 servers")
      await time.increase(3600)

      let requestId = 0

      async function sendRequest() {
        const id = `request_${++requestId}`
        await contract.sendRequest(multihash.generate(id))
      }

      // First requests initializes a batch of 1
      const promises = []
      for (let i = 0; i < requestsPerBatch + 1; i++) {
        promises.push(sendRequest().catch(e => console.error(e)))
      }
      await Promise.allSettled(promises)
      console.log("Sent %d requests", requestsPerBatch)

      async function processBatch() {
        const batch = await contract.connect(wallets[0]).getCurrentBatch()
        const batchNonce = batch.nonce.toNumber()
        const result = batchResult1(batchNonce, batch.requests.length)
        const encodedResult = await contract.encodeResult(result)
        console.log(`Result array: ${Buffer.from(result.encodedResponses).toString("hex").slice(0, 1000)}`)
        console.log(
          `Batch ${batchNonce} result: size = ${(encodedResult.length - 2) / 2}, data = ${encodedResult.slice(0, 1000)}`
        )
        const resultHash = await contract.hashResult(result)
        const submitPromises = wallets.map(async (wallet, i) => {
          try {
            const tx = await contract.connect(wallet).submitBatchResultHash(batchNonce, resultHash)
            const receipt = await tx.wait()
            console.log(
              "Wallet %d: submitBatchResultHash(%d). Gas: %d. Events: %s",
              i,
              batchNonce,
              receipt.gasUsed.toNumber(),
              [...new Set(receipt.events?.map(ev => ev.event))]
            )
          } catch (e) {
            console.log("Wallet %d: submitBatchResultHash(%d). %s", i, batchNonce, "" + e)
          }
        })
        await Promise.allSettled(submitPromises)
        await time.increase(randomBackoffMax)
        const tx = await contract.connect(wallets[0]).revealBatchResult(result, { gasLimit: 30000000 })
        const receipt = await tx.wait()
        console.log("Wallet 0: revealBatchResult(%d). Gas: %d. Events: %s", batchNonce, receipt.gasUsed.toNumber(), [
          ...new Set(receipt.events?.map(ev => ev.event))
        ])
      }

      await processBatch()
      await processBatch()

      await contract.connect(wallets[0]).housekeepInactive()
      expect(await contract.getServerCount()).to.equal(150)
    }

    it.only("Should handle 200 servers and 2000 requests per batch without exploding gas limit", async () => {
      await playScenario(2000)
    }).timeout(300000)
  })
})
