import { ethers } from 'ethers'
import * as sapphire from '@oasisprotocol/sapphire-paratime'
import type { AsyncDatabase } from 'promised-sqlite3'

import type { AppConfig } from './app.config.js'
import {
  type Request,
  type Response,
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
  payload: Request
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

  static async create(config: AppConfig) {
    const ipfs = await IPFSStorage.create(config.ipfsRpcUrl)
    const wallet = sapphire.wrap(new ethers.Wallet(config.walletPrivateKey, config.ethersProvider))
    const contract = RPC3Factory.connect(config.contractAddress, wallet)
    return new RPC3Server(ipfs, contract, wallet)
  }

  get contract(): RPC3 {
    return this._contract
  }

  async ensureIsRegistered() {
    const registered = await this._contract.isRegistered(this._wallet.address)
    if (!registered) {
      const tx = await this._contract.serverRegister({ value: await this._contract.getStakeRequirement() })
      console.log('register tx', await tx.wait())
    }
  }

  async processBatch(onRequest: (req: RequestContext) => Promise<Response>) {
    const batch = await this._contract
      .getCurrentBatch(await this._permitManager.acquirePermit(), 0)
      .catch(err => console.error('processBatch(): could not get batch info', err))
    if (batch === undefined) {
      return
    }
    if (Date.now() / 1000 > batch.expiresAt.toNumber()) {
      const tx = await this._contract.skipBatchIfConsensusExpired()
      console.log('skip batch tx', await tx.wait())
      return
    }
    await this._ipfs.restoreDatabase(multihash.stringify(batch.initialStateCid))
    const db = await this._ipfs.openDatabase()
    const responses: string[] = []
    for (const { author, cid } of batch.requests) {
      const cidStr = multihash.stringify(cid)
      const payload: Request = JSON.parse(await utils.asyncIterableToString(this._ipfs.client.cat(cidStr)))
      const response = await onRequest({ db, author, payload })
      const addResult = await this._ipfs.client.add(JSON.stringify(response))
      responses.push(addResult.cid.toString())
    }
    await db.close()
    const finalStateCid = multihash.parse((await this._ipfs.persistDatabase()).toString())
    const responseCid = multihash.parse((await this._ipfs.client.add(JSON.stringify(responses))).cid.toString())
    const tx = await this._contract.submitBatchResult(batch.nonce, { finalStateCid, responseCid })
    console.log('submit batch result tx', await tx.wait())
  }
}
