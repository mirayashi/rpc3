import { ethers } from 'ethers'
import * as sapphire from '@oasisprotocol/sapphire-paratime'
import type { AsyncDatabase } from 'promised-sqlite3'

import type { AppConfig } from '../app.config.js'
import { type Request, type Response, type RPC3, RPC3Factory, multihash, utils } from 'rpc3-common'
import IPFSStorage from './IPFSStorage.js'

export type RequestContext = {
  db: AsyncDatabase
  author: string
  payload: Request
}

export default class RPC3Server {
  private readonly _ipfs: IPFSStorage
  private readonly _contract: RPC3

  private constructor(ipfs: IPFSStorage, contract: RPC3) {
    this._ipfs = ipfs
    this._contract = contract
  }

  static async create(config: AppConfig) {
    const ipfs = await IPFSStorage.create(config.ipfsRpcUrl)
    const wallet = sapphire.wrap(new ethers.Wallet(config.walletPrivateKey, config.ethersProvider))
    const contract = RPC3Factory.connect(config.contractAddress, wallet)
    return new RPC3Server(ipfs, contract)
  }

  get contract(): RPC3 {
    return this._contract
  }

  async ensureIsRegistered() {
    const registered = await this._contract.amIRegistered()
    if (!registered) {
      const tx = await this._contract.serverRegister({ value: await this._contract.getStakeRequirement() })
      console.log('register tx', await tx.wait())
    }
  }

  async processBatch(onRequest: (req: RequestContext) => Promise<Response>) {
    const batch = await this._contract
      .getCurrentBatch(0)
      .catch(err => console.error('processBatch(): could not get batch info', err))
    if (batch === undefined) {
      return
    }
    if (Date.now() / 1000 > batch.expiresAt.toNumber()) {
      const tx = await this._contract.skipBatchIfConsensusExpired()
      console.log('skip batch tx', await tx.wait())
      return
    }
    await this._ipfs.restoreDatabase(multihash.stringify(batch.initialStateIpfsHash))
    const db = await this._ipfs.openDatabase()
    const responses: string[] = []
    for (const { author, ipfsHash } of batch.requests) {
      const cid = multihash.stringify(ipfsHash)
      const payload: Request = JSON.parse(await utils.asyncIterableToString(this._ipfs.client.cat(cid)))
      const response = await onRequest({ db, author, payload })
      const addResult = await this._ipfs.client.add(JSON.stringify(response))
      responses.push(addResult.cid.toString())
    }
    await db.close()
    const finalStateIpfsHash = multihash.parse((await this._ipfs.persistDatabase()).toString())
    const responseIpfsHash = multihash.parse((await this._ipfs.client.add(JSON.stringify(responses))).cid.toString())
    const tx = await this._contract.submitBatchResult(batch.nonce, { finalStateIpfsHash, responseIpfsHash })
    console.log('submit batch result tx', await tx.wait())
  }
}
