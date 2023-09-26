import { BigNumber, BigNumberish, ethers } from 'ethers'
import * as sapphire from '@oasisprotocol/sapphire-paratime'
import type { AsyncDatabase } from 'promised-sqlite3'

import {
  type BaseConfig,
  type RPC3,
  type SapphireWallet,
  multihash,
  PermitManager,
  RPC3Factory,
  utils
} from '@rpc3/common'
import IPFSStorage from './IPFSStorage.js'

export type RequestContext = {
  db: AsyncDatabase
  author: string
  payload: unknown
}

export default class RPC3Server {
  private readonly _ipfs: IPFSStorage
  private readonly _contract: RPC3
  private readonly _wallet: SapphireWallet
  private readonly _permitManager: PermitManager

  private constructor(ipfs: IPFSStorage, contract: RPC3, wallet: SapphireWallet) {
    this._ipfs = ipfs
    this._contract = contract
    this._wallet = wallet
    this._permitManager = new PermitManager(contract, wallet)
  }

  static async create(config: BaseConfig) {
    const ipfs = await IPFSStorage.create(config.ipfsRpcUrl)
    const wallet = sapphire.wrap(new ethers.Wallet(config.walletPrivateKey, config.ethersProvider))
    const contract = RPC3Factory.connect(config.contractAddress, wallet)
    return new RPC3Server(ipfs, contract, wallet)
  }

  get contract(): RPC3 {
    return this._contract
  }

  get wallet(): SapphireWallet {
    return this._wallet
  }

  async ensureIsRegistered() {
    const registered = await this._contract.isRegistered(this._wallet.address)
    if (!registered) {
      const staked = await this._contract.getStakeRequirement()
      const tx = await this._contract.serverRegister({ value: staked })
      await tx.wait()
      console.log('Registered with stake: %s ROSE', ethers.utils.formatEther(staked))
    } else {
      const serverData = await this._contract.getServerData(await this._permitManager.acquirePermit())
      console.log(
        `Server already registered.
        Stake: %s ROSE
        Contribution points: %d
        Last seen: batch %s
        Next housekeep: batch %d
        `,
        ethers.utils.formatEther(serverData.stake),
        serverData.contributions,
        serverData.lastSeen,
        serverData.nextHousekeepAt
      )
    }
  }

  listenToRequests(onRequest: (req: RequestContext) => Promise<unknown>) {
    const processAll = async (batchNonce: BigNumber) => {
      await this._processBatch(onRequest).catch(err => console.error('processBatch: unexpected error occured', err))
      await this._housekeep(batchNonce).catch(err => console.error('housekeep: unexpected error occured', err))
    }
    this._contract.on('NextBatchReady', async (batchNonce: BigNumber) => {
      await utils.nextBlock(this._contract.provider)
      await processAll(batchNonce)
    })
    this._contract.on('HousekeepSuccess', (cleanCount: BigNumber, nextHousekeepAt: BigNumber) => {
      console.log(
        'Executed housekeeping on %d inactive addresses. Next housekeep at batch %d.',
        cleanCount,
        nextHousekeepAt
      )
    })
    this._contract
      .getCurrentBatchNonce()
      .then(processAll, err => console.error('listenToRequests: could not get current batch nonce', err))
  }

  async getClaimableBalance() {
    const fromContributions = await this._contract
      .estimateClaimableRewards(await this._permitManager.acquirePermit())
      .catch(() => BigNumber.from(0))
    const fromPendingPayments = await this._contract.payments(this._wallet.address)
    return { fromContributions, fromPendingPayments }
  }

  async withdrawAll({ threshold = 0 }: { threshold?: BigNumberish } = {}) {
    const { fromContributions, fromPendingPayments } = await this.getClaimableBalance()
    const promises: Promise<void>[] = []
    if (fromContributions.gt(threshold)) {
      promises.push(
        (async () => {
          const tx = await this._contract.claimRewards()
          await tx.wait()
          console.log(
            'withdrawAll: successfully withdrawn %s ROSE from contributions',
            ethers.utils.formatEther(fromContributions)
          )
        })()
      )
    }
    if (fromPendingPayments.gt(threshold)) {
      promises.push(
        (async () => {
          const tx = await this._contract.withdrawPayments(this._wallet.address)
          await tx.wait()
          console.log(
            'withdrawAll: successfully withdrawn %s ROSE from pending payments',
            ethers.utils.formatEther(fromPendingPayments)
          )
        })()
      )
    }
    await Promise.all(promises)
  }

  private async _housekeep(batchNonce: BigNumber) {
    const permit = await this._permitManager.acquirePermit()
    const serverData = await this._contract.getServerData(permit)
    if (batchNonce.lt(serverData.nextHousekeepAt)) {
      return
    }
    const inactiveServers: string[] = []
    let maxPage = 0
    for (let i = 0; i <= maxPage && inactiveServers.length < 10; i++) {
      const [addresses, pages] = await this._contract.getInactiveServers(permit, i)
      inactiveServers.push(...addresses)
      maxPage = pages.toNumber()
    }
    await this._contract.housekeepInactive(inactiveServers)
  }

  private async _processBatch(onRequest: (req: RequestContext) => Promise<unknown>) {
    const batch = await this._contract
      .getCurrentBatch(await this._permitManager.acquirePermit(), 0)
      .catch(() => console.error('processBatch: could not get current batch, waiting for next one'))
    if (batch === undefined) {
      return
    }
    if (Date.now() / 1000 > batch.expiresAt.toNumber()) {
      const tx = await this._contract.skipBatchIfConsensusExpired()
      await tx.wait()
      console.log('processBatch: skipped batch %d because it has expired', batch.nonce)
      return
    }
    await this._ipfs.restoreDatabase(multihash.stringify(batch.initialStateCid))
    const db = await this._ipfs.openDatabase()
    const responses: string[] = []
    let i = 0
    for (const { author, cid } of batch.requests) {
      console.log('processBatch: batch %d: processing request %d/%d...', batch.nonce, ++i, batch.requests.length)
      const cidStr = multihash.stringify(cid)
      const payload = JSON.parse(await utils.asyncIterableToString(this._ipfs.client.cat(cidStr)))
      const response = await onRequest({ db, author, payload })
      const addResult = await this._ipfs.client.add(JSON.stringify(response))
      responses.push(addResult.cid.toString())
    }
    await db.close()
    const finalStateCid = multihash.parse((await this._ipfs.persistDatabase()).toString())
    const responseCid = multihash.parse((await this._ipfs.client.add(JSON.stringify(responses))).cid.toString())
    const tx = await this._contract.submitBatchResult(batch.nonce, { finalStateCid, responseCid })
    await tx.wait()
    console.log(
      'processBatch: submitted result for batch %d. New state: %s, responses: %s',
      batch.nonce,
      multihash.stringify(finalStateCid),
      multihash.stringify(responseCid)
    )
  }
}
