import { time, loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { RESULT_1, RESULT_2, RESULT_3 } from '../src/batchResult'
import expectThatCurrentBatchHas from '../src/expectThatCurrentBatchHas'
import { multihash } from 'rpc3-common'
import runParallel from '../src/runParallel'
import {
  deploy,
  deployAndPauseContract,
  deployAndMake220UsersHousekeepable,
  deployAndReachConsensus,
  deployAndRegister4Users,
  deployAndRegisterOwner,
  deployAndSubmitOneRequest
} from '../src/fixtures'
import { registerManyServers, toStruct } from '../src/utils'

describe('RPC3', () => {
  describe('Deployment', () => {
    it('Should initialize correctly', async () => {
      const { contract, globalParams } = await loadFixture(deploy)
      expect(await contract.globalParams()).to.deep.equal(toStruct(globalParams))
    })

    it('Should fail if global params are invalid', async () => {
      await expect(deploy({ consensusQuorumPercent: 101 })).to.be.reverted
    })
  })

  describe('Owner functions', () => {
    it('Should revert if caller is not owner', async () => {
      const {
        contract,
        globalParams,
        users: [user1]
      } = await loadFixture(deploy)
      const functions = [
        contract.connect(user1).pause(),
        contract.connect(user1).unpause(),
        contract.connect(user1).setGlobalParams(globalParams)
      ]
      for (const f of functions) {
        await expect(f).to.be.revertedWith('Ownable: caller is not the owner')
      }
    })

    it('Should pause and unpause contract', async () => {
      const { contract, owner } = await loadFixture(deploy)
      await expect(contract.pause()).to.emit(contract, 'Paused').withArgs(owner.address)
      expect(await contract.paused()).to.be.true
      await expect(contract.unpause()).to.emit(contract, 'Unpaused').withArgs(owner.address)
      expect(await contract.paused()).to.be.false
    })

    it('Should update global params', async () => {
      const { contract, globalParams } = await loadFixture(deployAndPauseContract)
      const newGlobalParams = { ...globalParams, minStake: ethers.utils.parseEther('5') }
      await expect(contract.setGlobalParams(newGlobalParams))
        .to.emit(contract, 'GlobalParamsUpdated')
        .withArgs(toStruct(newGlobalParams))
      expect(await contract.globalParams()).to.deep.equal(toStruct(newGlobalParams))
    })

    it('Should revert on setGlobalParams if contract is not paused', async () => {
      const { contract, globalParams } = await loadFixture(deploy)
      await expect(contract.setGlobalParams(globalParams)).to.be.revertedWith('Pausable: not paused')
    })

    it('Should revert on setGlobalParams if a batch is in progress', async () => {
      const { contract, globalParams } = await loadFixture(deploy)
      await contract.sendRequest(multihash.generate('some request'))
      await contract.pause()
      await expect(contract.setGlobalParams(globalParams)).to.be.revertedWithCustomError(contract, 'BatchInProgress')
    })

    it('Should revert on setGlobalParams because params are invalid', async () => {
      const { contract, globalParams } = await loadFixture(deployAndPauseContract)
      const invalidParams = {
        ...globalParams,
        minStake: 0,
        consensusQuorumPercent: 111,
        consensusMajorityPercent: 111,
        ownerRoyaltiesPercent: 111,
        slashPercent: 111
      }
      await expect(contract.setGlobalParams(invalidParams))
        .to.be.revertedWithCustomError(contract, 'InvalidGlobalParams')
        .withArgs([
          toStruct({ field: 'minStake', reason: 'should be nonzero' }),
          toStruct({ field: 'consensusQuorumPercent', reason: 'should be between 1 and 100' }),
          toStruct({ field: 'consensusMajorityPercent', reason: 'should be between 51 and 100' }),
          toStruct({ field: 'ownerRoyaltiesPercent', reason: 'should be between 0 and 100' }),
          toStruct({ field: 'slashPercent', reason: 'should be between 0 and 100' })
        ])
      const invalidParams2 = {
        ...globalParams,
        consensusQuorumPercent: 0,
        consensusMajorityPercent: 49
      }
      await expect(contract.setGlobalParams(invalidParams2))
        .to.be.revertedWithCustomError(contract, 'InvalidGlobalParams')
        .withArgs([
          toStruct({ field: 'consensusQuorumPercent', reason: 'should be between 1 and 100' }),
          toStruct({ field: 'consensusMajorityPercent', reason: 'should be between 51 and 100' })
        ])
    })
  })

  describe('Treasury and owner royalties', () => {
    it('Should accept direct transfers and add received funds to treasury', async () => {
      const { contract, owner } = await loadFixture(deploy)
      await owner.sendTransaction({ to: contract.address, value: ethers.utils.parseEther('10') })
      expect(await contract.treasury()).to.equal(ethers.utils.parseEther('10'))
      expect(await ethers.provider.getBalance(contract.address)).to.equal(ethers.utils.parseEther('10'))
    })

    it('Should add 95% to treasury and transfer 5% to owner as royalties', async () => {
      const {
        contract,
        owner,
        users: [user1]
      } = await deploy({ ownerRoyaltiesPercent: 5 })
      await expect(contract.connect(user1).donateToTreasury({ value: ethers.utils.parseEther('10') }))
        .to.emit(contract, 'AddedToTreasury')
        .withArgs(ethers.utils.parseEther('9.5'), ethers.utils.parseEther('0.5'))
      expect(await contract.treasury()).to.equal(ethers.utils.parseEther('9.5'))
      expect(await contract.payments(owner.address)).to.equal(ethers.utils.parseEther('0.5'))
    })
  })

  describe('Server registration', () => {
    it('Should register server', async () => {
      const { contract, owner, globalParams } = await loadFixture(deploy)
      expect(await contract.amIRegistered()).to.be.false
      await expect(contract.serverRegister({ value: ethers.utils.parseEther('1') }))
        .to.emit(contract, 'ServerRegistered')
        .withArgs(owner.address)
      expect(await contract.amIRegistered()).to.be.true
      expect(await contract.getServerData()).to.deep.equal(
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

    it('Should not register server, already registered', async () => {
      const { contract } = await loadFixture(deployAndRegisterOwner)
      await expect(contract.serverRegister({ value: ethers.utils.parseEther('2') })).to.be.revertedWithCustomError(
        contract,
        'ServerAlreadyRegistered'
      )
    })

    it('Should not register server, max reached', async () => {
      const {
        contract,
        users: [user1, user2, user3]
      } = await deploy({ maxServers: 2 })
      await expect(contract.connect(user1).serverRegister({ value: ethers.utils.parseEther('1') })).to.emit(
        contract,
        'ServerRegistered'
      )
      await expect(contract.connect(user2).serverRegister({ value: ethers.utils.parseEther('2') })).to.emit(
        contract,
        'ServerRegistered'
      )
      await expect(
        contract.connect(user3).serverRegister({ value: ethers.utils.parseEther('4') })
      ).to.be.revertedWithCustomError(contract, 'MaxServersReached')
    })

    it('Should not register server, below minimum stake', async () => {
      const { contract } = await loadFixture(deploy)
      await expect(contract.serverRegister({ value: ethers.utils.parseEther('0.5') }))
        .to.be.revertedWithCustomError(contract, 'InsufficientStake')
        .withArgs(ethers.utils.parseEther('1'))
      expect(await contract.amIRegistered()).to.be.false
    })

    it('Should not register server, stake requirement has been doubled', async () => {
      const {
        contract,
        users: [user1]
      } = await loadFixture(deployAndRegisterOwner)
      await expect(
        contract.connect(user1).serverRegister({ value: ethers.utils.parseEther('1') })
      ).to.be.revertedWithCustomError(contract, 'InsufficientStake')
      expect(await contract.connect(user1).amIRegistered()).to.be.false
    })

    it('Should unregister server, with a fee that go to treasury', async () => {
      const { contract, owner } = await loadFixture(deployAndRegisterOwner)
      await expect(contract.serverUnregister())
        .to.emit(contract, 'ServerUnregistered')
        .withArgs(owner.address)
        .and.to.emit(contract, 'AddedToTreasury')
        .withArgs(ethers.utils.parseEther('0.02'), 0)
      expect(await contract.amIRegistered()).to.be.false
      await expect(contract.getServerData()).to.be.revertedWithCustomError(contract, 'ServerNotRegistered')
      expect(await contract.payments(owner.address)).to.equal(ethers.utils.parseEther('0.98'))
      expect(await contract.treasury()).to.equal(ethers.utils.parseEther('0.02')) // Slashed amount go to treasury
    })

    it('Should not unregister server, not registered', async () => {
      const {
        contract,
        users: [user1]
      } = await loadFixture(deployAndRegisterOwner)
      await expect(contract.connect(user1).serverUnregister()).to.be.revertedWithCustomError(
        contract,
        'ServerNotRegistered'
      )
    })

    it('Should be at minimum stake', async () => {
      const { contract } = await loadFixture(deploy)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('1'))
    })

    it('Should double stake after 1 registration', async () => {
      const { contract } = await loadFixture(deployAndRegisterOwner)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('2'))
    })

    it('Should double stake again (x4) after another registration', async () => {
      const {
        contract,
        users: [user1]
      } = await loadFixture(deployAndRegisterOwner)
      await contract.connect(user1).serverRegister({ value: ethers.utils.parseEther('2') })
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('4'))
    })

    it('Should decrease stake in a linear way until a week passes, then halve every week until it goes back to minimum stake', async () => {
      const { contract } = await loadFixture(deployAndRegister4Users)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('16'))
      await time.increase(120960)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('14.4'))
      await time.increase(181440)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('12'))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('8'))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('6'))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('4'))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('3'))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('2'))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('1.5'))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('1'))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('1'))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('1'))
    })

    it('Should adjust stake correctly taking into account both new registrations and over time decrease', async () => {
      const {
        contract,
        users: [user1, user2, user3, user4]
      } = await loadFixture(deploy)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('1'))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('1'))
      await contract.connect(user1).serverRegister({ value: await contract.getStakeRequirement() })
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('2'))
      await time.increase(302400)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('1.5'))
      await contract.connect(user2).serverRegister({ value: await contract.getStakeRequirement() })
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('3'))
      await time.increase(120960)
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('2.7'))
      await contract.connect(user3).serverRegister({ value: await contract.getStakeRequirement() })
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('5.4'))
      await time.increase(6048000) // 10 weeks
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('1'))
      await contract.connect(user4).serverRegister({ value: await contract.getStakeRequirement() })
      expect(await contract.getStakeRequirement()).to.equal(ethers.utils.parseEther('2'))
    })
  })

  describe('Request submission', () => {
    it('Should revert if contract is paused', async () => {
      const { contract } = await loadFixture(deployAndPauseContract)
      await expect(contract.sendRequest(multihash.generate('hello'))).to.be.revertedWith('Pausable: paused')
    })

    it('Should initialize first batch', async () => {
      const {
        contract,
        users: [user1],
        stateIpfsHash,
        globalParams: { consensusMaxDuration }
      } = await loadFixture(deployAndRegisterOwner)
      await expect(contract.connect(user1).sendRequest(multihash.generate('request1')))
        .to.emit(contract, 'NextBatchReady')
        .withArgs(1)
      await expectThatCurrentBatchHas(contract, {
        nonce: 1,
        stateIpfsHash,
        sizeOf: 1,
        requests: [
          toStruct({
            author: user1.address,
            ipfsHash: toStruct(multihash.generate('request1'))
          })
        ],
        expiresAt: (await time.latest()) + consensusMaxDuration.toNumber()
      })
    })

    it('Should enqueue subsequent requests', async () => {
      const {
        contract,
        owner,
        users: [user1],
        stateIpfsHash
      } = await loadFixture(deployAndSubmitOneRequest)

      await contract.sendRequest(multihash.generate('request2'))
      // request2 should be only in queue, not in batch
      await expectThatCurrentBatchHas(contract.connect(user1), {
        stateIpfsHash,
        sizeOf: 1,
        requests: [
          toStruct({
            author: owner.address,
            ipfsHash: toStruct(multihash.generate('request1'))
          })
        ]
      })
    })
  })

  describe('Batch result submissions', () => {
    it('Should revert if not registered', async () => {
      const {
        contract,
        users: [user1]
      } = await loadFixture(deployAndRegisterOwner)

      const functions = [
        contract.connect(user1).getCurrentBatch(0),
        contract.connect(user1).submitBatchResult(1, RESULT_1),
        contract.connect(user1).getServerData(),
        contract.connect(user1).skipBatchIfConsensusExpired(),
        contract.connect(user1).getInactiveServers(0),
        contract.connect(user1).housekeepInactive([]),
        contract.connect(user1).estimateClaimableRewards(),
        contract.connect(user1).claimRewards()
      ]

      for (const f of functions) {
        await expect(f).to.be.revertedWithCustomError(contract, 'ServerNotRegistered')
      }
    })

    it('Should revert if current batch is empty', async () => {
      const { contract } = await loadFixture(deployAndRegisterOwner)
      await expect(contract.getCurrentBatch(0)).to.be.revertedWithCustomError(contract, 'EmptyBatch')
    })

    it('Should revert if nonce is invalid', async () => {
      const { contract } = await loadFixture(deployAndRegisterOwner)
      await expect(contract.submitBatchResult(42, RESULT_1)).to.be.revertedWithCustomError(
        contract,
        'InvalidBatchNonce'
      )
    })

    it('Should revert if consensus not active', async () => {
      const { contract } = await loadFixture(deployAndRegisterOwner)
      await expect(contract.submitBatchResult(0, RESULT_1)).to.be.revertedWithCustomError(
        contract,
        'ConsensusNotActive'
      )
    })

    it('Should revert if attempt to submit result more than once', async () => {
      const {
        contract,
        users: [user1]
      } = await loadFixture(deployAndSubmitOneRequest)
      await expect(contract.connect(user1).submitBatchResult(1, RESULT_1)).to.emit(contract, 'BatchResultHashSubmitted')
      await expect(contract.connect(user1).submitBatchResult(1, RESULT_1)).to.be.revertedWithCustomError(
        contract,
        'ResultAlreadySubmitted'
      )
    })

    it('Should revert if consensus expired', async () => {
      const {
        contract,
        users: [user1, user2],
        globalParams
      } = await loadFixture(deployAndSubmitOneRequest)

      await expect(contract.connect(user1).submitBatchResult(1, RESULT_1)).to.emit(contract, 'BatchResultHashSubmitted')

      await time.increase(globalParams.consensusMaxDuration)

      await expect(contract.connect(user2).submitBatchResult(1, RESULT_1)).to.be.revertedWithCustomError(
        contract,
        'ConsensusNotActive'
      )
    })

    it('Should handle batches with multiple pages', async () => {
      const size = 1440
      const {
        contract,
        users: [user1, user2, user3]
      } = await deployAndSubmitOneRequest({ batchSize: size, consensusMaxDuration: 999999 })

      let counter = 0
      await runParallel(size, async i => {
        await contract.sendRequest(multihash.generate(`${i}`))
        process.stdout.write(`\r        Sent request ${++counter}/${size}`)
      })
      console.log()

      // First batch always contains one element (the first request) so we skip it
      await contract.connect(user1).submitBatchResult(1, RESULT_1)
      await contract.connect(user2).submitBatchResult(1, RESULT_1)
      await expect(contract.connect(user3).submitBatchResult(1, RESULT_1))
        .to.emit(contract, 'NextBatchReady')
        .withArgs(2)

      const firstPage = await contract.connect(user1).getCurrentBatch(0)
      expect(firstPage.nonce).to.equal(2)
      expect(firstPage.page).to.equal(0)
      expect(firstPage.maxPage).to.equal(1)
      expect(firstPage.requests).to.have.lengthOf(1000)

      const secondPage = await contract.connect(user1).getCurrentBatch(1)
      expect(secondPage.nonce).to.equal(2)
      expect(secondPage.page).to.equal(1)
      expect(secondPage.maxPage).to.equal(1)
      expect(secondPage.requests).to.have.lengthOf(440)

      await expect(contract.connect(user1).getCurrentBatch(2))
        .to.be.revertedWithCustomError(contract, 'MaxPageExceeded')
        .withArgs(1)
    })

    it('Should emit BatchCompleted and process contributions if quorum and majority is reached', async () => {
      const {
        globalParams: { inactivityDuration },
        contract,
        users: [user1, user2, user3],
        usersLastSeen,
        usersRegisteredAt
      } = await loadFixture(deployAndSubmitOneRequest)

      await expect(contract.connect(user1).submitBatchResult(1, RESULT_1))
        .to.emit(contract, 'BatchResultHashSubmitted')
        .and.not.to.emit(contract, 'BatchCompleted')
        .and.not.to.emit(contract, 'BatchFailed')
      usersLastSeen[0] = await time.latest()

      await expect(contract.connect(user2).submitBatchResult(1, RESULT_1))
        .to.emit(contract, 'BatchResultHashSubmitted')
        .and.not.to.emit(contract, 'BatchCompleted')
        .and.not.to.emit(contract, 'BatchFailed')
      usersLastSeen[1] = await time.latest()

      await expect(contract.connect(user3).submitBatchResult(1, RESULT_2))
        .to.emit(contract, 'BatchResultHashSubmitted')
        .and.to.emit(contract, 'BatchCompleted')
        .withArgs(1)
        .and.not.to.emit(contract, 'BatchFailed')
      usersLastSeen[2] = await time.latest()

      await contract.connect(user1).applyPendingContribution()
      await contract.connect(user2).applyPendingContribution()
      await contract.connect(user3).applyPendingContribution()

      expect(await contract.connect(user1).getServerData()).to.deep.equal(
        toStruct({
          addr: user1.address,
          stake: ethers.utils.parseEther('1'),
          contributions: 1,
          lastSeen: usersLastSeen[0],
          nextHousekeepAt: ethers.BigNumber.from(usersRegisteredAt[0]).add(inactivityDuration)
        })
      )
      expect(await contract.connect(user2).getServerData()).to.deep.equal(
        toStruct({
          addr: user2.address,
          stake: ethers.utils.parseEther('2'),
          contributions: 1,
          lastSeen: usersLastSeen[1],
          nextHousekeepAt: ethers.BigNumber.from(usersRegisteredAt[1]).add(inactivityDuration.mul(2))
        })
      )
      expect(await contract.connect(user3).getServerData()).to.deep.equal(
        toStruct({
          addr: user3.address,
          stake: ethers.utils.parseEther('3.92'),
          contributions: 0,
          lastSeen: usersLastSeen[2],
          nextHousekeepAt: ethers.BigNumber.from(usersRegisteredAt[2]).add(inactivityDuration.mul(3))
        })
      )
      expect(await contract.treasury()).to.equal(ethers.utils.parseEther('0.08'))
    })

    it('Should unregister user after slashing if remaining stake is below minimum', async () => {
      const {
        contract,
        users: [user1, user2, user3],
        usersLastSeen
      } = await loadFixture(deployAndSubmitOneRequest)
      await contract.connect(user1).submitBatchResult(1, RESULT_2)
      usersLastSeen[0] = await time.latest()
      await contract.connect(user2).submitBatchResult(1, RESULT_1)
      usersLastSeen[1] = await time.latest()
      await contract.connect(user3).submitBatchResult(1, RESULT_1)
      usersLastSeen[2] = await time.latest()

      await expect(contract.connect(user1).applyPendingContribution()).to.emit(contract, 'ServerUnregistered')
      expect(await contract.payments(user1.address)).to.equal(ethers.utils.parseEther('0.98'))
      expect(await contract.treasury()).to.equal(ethers.utils.parseEther('0.02'))
    })

    it('Should emit BatchFailed if quorum is reached but not majority', async () => {
      const {
        contract,
        users: [user1, user2, user3]
      } = await loadFixture(deployAndSubmitOneRequest)

      await expect(contract.connect(user1).submitBatchResult(1, RESULT_1))
        .to.emit(contract, 'BatchResultHashSubmitted')
        .and.not.to.emit(contract, 'BatchCompleted')
        .and.not.to.emit(contract, 'BatchFailed')

      await expect(contract.connect(user2).submitBatchResult(1, RESULT_2))
        .to.emit(contract, 'BatchResultHashSubmitted')
        .and.not.to.emit(contract, 'BatchCompleted')
        .and.not.to.emit(contract, 'BatchFailed')

      await expect(contract.connect(user3).submitBatchResult(1, RESULT_3))
        .to.emit(contract, 'BatchResultHashSubmitted')
        .and.to.emit(contract, 'BatchFailed')
        .withArgs(ethers.BigNumber.from(1))
        .and.not.to.emit(contract, 'BatchCompleted')
    })

    it('Should revert with ConsensusNotActive after a BatchCompleted', async () => {
      const {
        contract,
        users: [, , , user4]
      } = await loadFixture(deployAndReachConsensus)
      await expect(contract.connect(user4).submitBatchResult(1, RESULT_1)).to.be.revertedWithCustomError(
        contract,
        'ConsensusNotActive'
      )
    })

    it('Should revert with ConsensusNotActive after a BatchFailed', async () => {
      const {
        contract,
        users: [user1, user2, user3, user4]
      } = await loadFixture(deployAndSubmitOneRequest)

      await contract.connect(user1).submitBatchResult(1, RESULT_1)
      await contract.connect(user2).submitBatchResult(1, RESULT_2)
      await expect(contract.connect(user3).submitBatchResult(1, RESULT_3))
        .to.emit(contract, 'BatchFailed')
        .withArgs(ethers.BigNumber.from(1))

      await expect(contract.connect(user4).submitBatchResult(1, RESULT_1)).to.be.revertedWithCustomError(
        contract,
        'ConsensusNotActive'
      )
    })

    it('Should next batch be empty', async () => {
      const {
        contract,
        users: [user1]
      } = await loadFixture(deployAndReachConsensus)

      await expect(contract.connect(user1).getCurrentBatch(0)).to.be.revertedWithCustomError(contract, 'EmptyBatch')
    })

    it('Should next batch contain request2', async () => {
      const {
        contract,
        owner,
        users: [user1, user2, user3],
        globalParams: { consensusMaxDuration }
      } = await deployAndSubmitOneRequest()
      await contract.connect(user1).submitBatchResult(1, RESULT_1)
      await contract.connect(user2).submitBatchResult(1, RESULT_1)

      await contract.sendRequest(multihash.generate('request2'))

      await expect(contract.connect(user3).submitBatchResult(1, RESULT_1))
        .to.emit(contract, 'NextBatchReady')
        .withArgs(2)

      await expectThatCurrentBatchHas(contract.connect(user1), {
        nonce: 2,
        stateIpfsHash: RESULT_1.finalStateIpfsHash,
        sizeOf: 1,
        requests: [
          toStruct({
            author: owner.address,
            ipfsHash: toStruct(multihash.generate('request2'))
          })
        ],
        expiresAt: (await time.latest()) + consensusMaxDuration.toNumber()
      })
    })
  })

  describe('Response reading', () => {
    it('Should revert if nonce is invalid', async () => {
      const { contract } = await loadFixture(deployAndSubmitOneRequest)
      await expect(contract.getResponse(42)).to.be.revertedWithCustomError(contract, 'InvalidRequestNonce')
    })

    it('Should revert if response is not available', async () => {
      const { contract } = await loadFixture(deployAndSubmitOneRequest)
      // At this point the request is submitted but the batch in which it's included did not reach consensus yet
      await expect(contract.getResponse(0)).to.be.revertedWithCustomError(contract, 'ResponseNotAvailable')
    })

    it('Should revert if caller is not the original sender of the request', async () => {
      const {
        contract,
        users: [user1]
      } = await loadFixture(deployAndReachConsensus)
      await expect(contract.connect(user1).getResponse(0)).to.be.revertedWithCustomError(
        contract,
        'RequestAuthorMismatch'
      )
    })

    it('Should read correct response when batch has one request', async () => {
      const { contract } = await loadFixture(deployAndReachConsensus)
      expect(await contract.getResponse(0)).to.deep.equal([toStruct(RESULT_1.responseIpfsHash), 0])
    })

    it('Should read correct response when request is queued for a future batch', async () => {
      const {
        contract,
        users: [user1, user2, user3]
      } = await deployAndRegister4Users({ maxBatchSize: 3 })

      // Will be included in batch 1
      await expect(contract.sendRequest(multihash.generate('1')))
        .to.emit(contract, 'RequestSubmitted')
        .withArgs(0)
      // Will be included in batch 2
      await expect(contract.sendRequest(multihash.generate('2')))
        .to.emit(contract, 'RequestSubmitted')
        .withArgs(1)
      await expect(contract.sendRequest(multihash.generate('3')))
        .to.emit(contract, 'RequestSubmitted')
        .withArgs(2)
      await expect(contract.sendRequest(multihash.generate('4')))
        .to.emit(contract, 'RequestSubmitted')
        .withArgs(3)
      // Will be included in batch 3
      await expect(contract.sendRequest(multihash.generate('5')))
        .to.emit(contract, 'RequestSubmitted')
        .withArgs(4)

      // Consensus batch 1
      await contract.connect(user1).submitBatchResult(1, RESULT_1)
      await contract.connect(user2).submitBatchResult(1, RESULT_1)
      await expect(contract.connect(user3).submitBatchResult(1, RESULT_1))
        .to.emit(contract, 'NextBatchReady')
        .withArgs(2)
      // Consensus batch 2
      await contract.connect(user1).submitBatchResult(2, RESULT_2)
      await contract.connect(user2).submitBatchResult(2, RESULT_2)
      await expect(contract.connect(user3).submitBatchResult(2, RESULT_2))
        .to.emit(contract, 'NextBatchReady')
        .withArgs(3)
      // Consensus batch 3
      await contract.connect(user1).submitBatchResult(3, RESULT_3)
      await contract.connect(user2).submitBatchResult(3, RESULT_3)
      await expect(contract.connect(user3).submitBatchResult(3, RESULT_3))
        .to.emit(contract, 'BatchCompleted')
        .withArgs(3)

      expect(await contract.getResponse(0)).to.deep.equal([toStruct(RESULT_1.responseIpfsHash), 0])
      expect(await contract.getResponse(1)).to.deep.equal([toStruct(RESULT_2.responseIpfsHash), 0])
      expect(await contract.getResponse(2)).to.deep.equal([toStruct(RESULT_2.responseIpfsHash), 1])
      expect(await contract.getResponse(3)).to.deep.equal([toStruct(RESULT_2.responseIpfsHash), 2])
      expect(await contract.getResponse(4)).to.deep.equal([toStruct(RESULT_3.responseIpfsHash), 0])
    })
  })

  describe('Batch skipping and housekeeping', () => {
    it('Should emit BatchFailed and give a contribution point if current batch has expired', async () => {
      const {
        contract,
        users: [user1, user2],
        globalParams: { consensusMaxDuration }
      } = await loadFixture(deployAndSubmitOneRequest)

      await expect(contract.connect(user1).submitBatchResult(1, RESULT_1)).to.emit(contract, 'BatchResultHashSubmitted')

      await expect(contract.connect(user2).skipBatchIfConsensusExpired()).not.to.emit(contract, 'BatchFailed')
      expect((await contract.connect(user2).getServerData()).contributions).to.equal(0)

      await time.increase(consensusMaxDuration)

      await expect(contract.connect(user2).skipBatchIfConsensusExpired()).to.emit(contract, 'BatchFailed')
      expect((await contract.connect(user2).getServerData()).contributions).to.equal(1)
    })

    it('Should revert if housekeep is on cooldown', async () => {
      const { contract } = await loadFixture(deployAndRegisterOwner)
      await expect(contract.getInactiveServers(0)).to.be.revertedWithCustomError(contract, 'HousekeepCooldown')
      await expect(contract.housekeepInactive([])).to.be.revertedWithCustomError(contract, 'HousekeepCooldown')
    })

    it('Should handle multiple pages of inactive servers', async () => {
      // Note: number of pages depends on the number of servers registered, not the number of servers actually inactive
      // so we might get 0 elements in first page and some elements in second page
      const {
        contract,
        users: [user1]
      } = await loadFixture(deployAndMake220UsersHousekeepable)
      const [addresses0, maxPage0] = await contract.connect(user1).getInactiveServers(0)
      expect(addresses0).to.have.lengthOf(10) // results capped to 10
      expect(maxPage0).to.equal(1)

      const [addresses1, maxPage1] = await contract.connect(user1).getInactiveServers(1)
      expect(addresses1).to.have.lengthOf(10)
      expect(maxPage1).to.equal(1)
      // Check that addresses0 and addresses1 have nothing in common
      expect([...new Set(addresses0.concat(addresses1))]).to.have.lengthOf(20)

      await expect(contract.connect(user1).getInactiveServers(2))
        .to.be.revertedWithCustomError(contract, 'MaxPageExceeded')
        .withArgs(1)
    })

    it('Should not housekeep more than 10 addresses at once', async () => {
      const {
        contract,
        globalParams: { inactivityDuration }
      } = await loadFixture(deployAndMake220UsersHousekeepable)
      const [addresses0] = await contract.getInactiveServers(0)
      const [addresses1] = await contract.getInactiveServers(1)
      const serverCount = await contract.getServerCount()
      const expectedServerCountAfter = serverCount.sub(10)
      const promise = contract.housekeepInactive(addresses0.concat(addresses1))
      await promise // This is to make sure the function completes before time.latest()
      await expect(promise)
        .to.emit(contract, 'HousekeepSuccess')
        .withArgs(10, expectedServerCountAfter.mul(inactivityDuration).add(await time.latest()))
      expect(await contract.getServerCount()).to.equal(expectedServerCountAfter)
    })

    it('Should emit HousekeepSuccess and give base reward when array is empty', async () => {
      const {
        contract,
        globalParams: { inactivityDuration, housekeepBaseReward }
      } = await loadFixture(deployAndRegisterOwner)
      await time.increase(inactivityDuration)
      await expect(contract.housekeepInactive([])).to.emit(contract, 'HousekeepSuccess')
      expect((await contract.getServerData()).contributions).to.equal(housekeepBaseReward)
    })

    it('Should emit HousekeepSuccess but should not unregister the caller', async () => {
      const {
        contract,
        globalParams: { inactivityDuration, housekeepBaseReward },
        owner
      } = await loadFixture(deployAndRegisterOwner)
      await time.increase(inactivityDuration)
      await expect(contract.housekeepInactive([owner.address]))
        .to.emit(contract, 'HousekeepSuccess')
        .and.not.to.emit(contract, 'ServerUnregistered')
      expect((await contract.getServerData()).contributions).to.equal(housekeepBaseReward)
    })

    it('Should emit HousekeepSuccess and unregister user4', async () => {
      const {
        contract,
        globalParams: { inactivityDuration, housekeepBaseReward, housekeepCleanReward },
        users: [user1, user2, user3, user4]
      } = await deployAndReachConsensus({ consensusMaxDuration: ethers.BigNumber.from(9999) })

      await contract.sendRequest(multihash.generate('request2'))

      await time.increase(inactivityDuration)
      await contract.connect(user1).submitBatchResult(2, RESULT_2)
      await contract.connect(user2).submitBatchResult(2, RESULT_2)
      await contract.connect(user3).submitBatchResult(2, RESULT_2)

      expect(await contract.connect(user1).getInactiveServers(0)).to.deep.equal([[user4.address], 0])

      await expect(contract.connect(user1).housekeepInactive([user4.address]))
        .to.emit(contract, 'HousekeepSuccess')
        .and.to.emit(contract, 'ServerUnregistered')
        .withArgs(user4.address)

      expect(await contract.getServerCount()).to.equal(3)

      expect((await contract.connect(user1).getServerData()).contributions).to.equal(
        housekeepBaseReward.add(housekeepCleanReward).add(2) // earned 2 points from submitting result
      )

      // user4 dfdf dsfwas slashed 0.16 because of inactivity, user3 was slashed 0.08 because they submitted wrong result in the
      // fixture
      expect(await contract.treasury()).to.equal(ethers.utils.parseEther('0.24'))
      expect(await contract.payments(user4.address)).to.equal(ethers.utils.parseEther('7.84'))
    })
  })

  describe('Rewards distribution', () => {
    it('Should distribute rewards according to contribution points', async () => {
      const {
        contract,
        users: [user1, user2, user3],
        globalParams: { consensusMaxDuration, inactivityDuration }
      } = await deployAndSubmitOneRequest({ consensusMaxDuration: ethers.BigNumber.from(9999) })

      await time.increase(consensusMaxDuration.add(1))

      // user 1 will skip an expired batch in order to get a contribution point
      await contract.connect(user1).skipBatchIfConsensusExpired()

      // users 1, 2 and 3 will get a contribution point by completing next batch
      await expect(contract.sendRequest(multihash.generate('request2')))
        .to.emit(contract, 'NextBatchReady')
        .withArgs(2)
      await contract.connect(user1).submitBatchResult(2, RESULT_2)
      await contract.connect(user2).submitBatchResult(2, RESULT_2)
      await contract.connect(user3).submitBatchResult(2, RESULT_2)

      // Elapse time so user3 can housekeep
      await time.increase(inactivityDuration.mul(3))

      // users 1, 2 and 3 will get a contribution point by completing next batch User 3 will get extra points for
      // housekeeping
      await expect(contract.sendRequest(multihash.generate('request3')))
        .to.emit(contract, 'NextBatchReady')
        .withArgs(3)
      await contract.connect(user1).submitBatchResult(3, RESULT_3)
      await contract.connect(user2).submitBatchResult(3, RESULT_3)
      await contract.connect(user3).submitBatchResult(3, RESULT_3)
      await contract.connect(user3).housekeepInactive((await contract.connect(user3).getInactiveServers(0))[0])

      await contract.connect(user1).applyPendingContribution()
      await contract.connect(user2).applyPendingContribution()
      await contract.connect(user3).applyPendingContribution()

      expect((await contract.connect(user1).getServerData()).contributions).to.equal(3)
      expect((await contract.connect(user2).getServerData()).contributions).to.equal(2)
      expect((await contract.connect(user3).getServerData()).contributions).to.equal(13)

      // there's already 0.16 ether in treasury because of user4 housekeeping
      await contract.donateToTreasury({ value: ethers.utils.parseEther('359.84') })

      expect(await contract.treasury()).to.equal(ethers.utils.parseEther('360'))
      expect(await contract.connect(user1).estimateClaimableRewards()).to.equal(ethers.utils.parseEther('60'))
      expect(await contract.connect(user2).estimateClaimableRewards()).to.equal(ethers.utils.parseEther('40'))
      expect(await contract.connect(user3).estimateClaimableRewards()).to.equal(ethers.utils.parseEther('260'))

      await contract.connect(user1).claimRewards()

      expect(await contract.treasury()).to.equal(ethers.utils.parseEther('300'))
      expect(await contract.connect(user1).estimateClaimableRewards()).to.equal(0)
      expect(await contract.connect(user2).estimateClaimableRewards()).to.equal(ethers.utils.parseEther('40'))
      expect(await contract.connect(user3).estimateClaimableRewards()).to.equal(ethers.utils.parseEther('260'))

      await contract.connect(user2).claimRewards()

      expect(await contract.treasury()).to.equal(ethers.utils.parseEther('260'))
      expect(await contract.connect(user1).estimateClaimableRewards()).to.equal(0)
      expect(await contract.connect(user2).estimateClaimableRewards()).to.equal(0)
      expect(await contract.connect(user3).estimateClaimableRewards()).to.equal(ethers.utils.parseEther('260'))

      await contract.connect(user3).claimRewards()

      expect(await contract.treasury()).to.equal(0)
      expect(await contract.connect(user1).estimateClaimableRewards()).to.equal(0)
      expect(await contract.connect(user2).estimateClaimableRewards()).to.equal(0)
      expect(await contract.connect(user3).estimateClaimableRewards()).to.equal(0)
    })
  })

  if (process.env.PERF === 'true') {
    describe('Performance tests', () => {
      async function playScenario(requestsPerBatch: number, serverCount: number) {
        const { contract, owner } = await deploy({ consensusMaxDuration: ethers.BigNumber.from(999999) })
        const wallets = await registerManyServers(contract, owner, serverCount)
        expect(await contract.getServerCount()).to.equal(serverCount)
        await time.increase(3600)

        // First requests initializes a batch of 1
        let counter = 0
        await runParallel(requestsPerBatch + 1, async i => {
          await contract.sendRequest(multihash.generate(`request_${i}`))
          process.stdout.write(`\r        Sent request ${++counter}/${requestsPerBatch + 1}`)
        })
        console.log()

        async function processBatch() {
          const batch = await contract.connect(wallets[0]).getCurrentBatch(0)
          const batchNonce = batch.nonce.toNumber()
          await runParallel(wallets.length, async i => {
            const wallet = wallets[i]
            try {
              const tx = await contract.connect(wallet).submitBatchResult(batchNonce, RESULT_1)
              const receipt = await tx.wait()
              console.log(
                'Wallet %d: submitBatchResult(%d). Gas: %d. Events: %s',
                i,
                batchNonce,
                receipt.gasUsed.toNumber(),
                [...new Set(receipt.events?.map(ev => ev.event))]
              )
            } catch (e) {
              console.log('Wallet %d: submitBatchResult(%d). %s', i, batchNonce, '' + e)
            }
          })
        }

        await processBatch()
        await processBatch()

        const inactiveServers: string[] = []
        let maxPage = 0
        for (let i = 0; i <= maxPage && inactiveServers.length < 10; i++) {
          const res = await contract.connect(wallets[0]).getInactiveServers(i)
          inactiveServers.push(...res[0])
          maxPage = res[1].toNumber()
        }

        await contract.connect(wallets[0]).housekeepInactive(inactiveServers)
        expect(await contract.getServerCount()).to.equal(Math.max(serverCount - 10, Math.ceil(serverCount * 0.75)))
      }

      it('Should handle 300 servers and 6000 reqs/batch without exploding computational resources', async () => {
        await playScenario(6000, 300)
      }).timeout(300000)
    })
  }
})
