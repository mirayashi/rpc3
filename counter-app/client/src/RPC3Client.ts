import EventEmitter from 'events'
import fs from 'fs'
import fsextra from 'fs-extra'
import path from 'path'
import os from 'os'

import { ethers } from 'ethers'
import * as sapphire from '@oasisprotocol/sapphire-paratime'
import { type IPFSHTTPClient, create as createIpfsRpcClient } from 'kubo-rpc-client'
import { AsyncDatabase } from 'promised-sqlite3'

import type { AppConfig } from '../app.config.js'
import {
  type Request,
  type Response,
  type RPC3,
  type SapphireWallet,
  multihash,
  PermitManager,
  RPC3Factory,
  utils
} from 'rpc3-common'

type EmittedResponse = {
  requestNonce: ethers.BigNumber
  batchNonce: ethers.BigNumber
  response: Response
}

export default class RPC3Client {
  private readonly _ipfs: IPFSHTTPClient
  private readonly _contract: RPC3
  private readonly _wallet: SapphireWallet
  private readonly _permitManager: PermitManager
  private readonly _pendingRequests = new Map<bigint, bigint[]>()
  private readonly _responseEmitter = new EventEmitter()

  private constructor(ipfs: IPFSHTTPClient, contract: RPC3, wallet: SapphireWallet) {
    this._ipfs = ipfs
    this._contract = contract
    this._wallet = wallet
    this._permitManager = new PermitManager(contract, wallet)
    this.initListeners()
  }

  static async create(config: AppConfig) {
    const ipfs = createIpfsRpcClient({ url: config.ipfsRpcUrl })
    const wallet = sapphire.wrap(new ethers.Wallet(config.walletPrivateKey, config.ethersProvider))
    const contract = RPC3Factory.connect(config.contractAddress, wallet)
    return new RPC3Client(ipfs, contract, wallet)
  }

  private initListeners() {
    this._contract.on('RequestSubmitted', (requestNonce: ethers.BigNumber, batchNonce: ethers.BigNumber) => {
      console.log('[request %d, batch %d] Request submitted', requestNonce, batchNonce)
      let requests = this._pendingRequests.get(batchNonce.toBigInt())
      if (!requests) {
        requests = []
        this._pendingRequests.set(batchNonce.toBigInt(), requests)
      }
      requests.push(requestNonce.toBigInt())
    })

    this._contract.on('BatchCompleted', async (batchNonce: ethers.BigNumber) => {
      const requests = this._pendingRequests.get(batchNonce.toBigInt()) ?? []
      this._pendingRequests.delete(batchNonce.toBigInt())
      for (const requestNonce of requests.map(r => ethers.BigNumber.from(r))) {
        console.log('[request %d, batch %d] Reading response', requestNonce, batchNonce)
        await utils.nextBlock(this._contract.provider)
        const response = await this._contract.getResponse(await this._permitManager.acquirePermit(), requestNonce)
        const batchResultCid = multihash.stringify(response[0])
        const position = response[1].toNumber()
        console.log(
          '[request %d, batch %d] Batch result CID: %s, position: %d',
          requestNonce,
          batchNonce,
          batchResultCid,
          position
        )
        const batchResult = JSON.parse(await utils.asyncIterableToString(this._ipfs.cat(batchResultCid)))
        const responseCid = batchResult[position]
        const responseContent: Response = JSON.parse(await utils.asyncIterableToString(this._ipfs.cat(responseCid)))
        console.log('[request %d, batch %d] Response CID: %s', requestNonce, batchNonce, responseCid)
        this._responseEmitter.emit('response', 'success', {
          requestNonce,
          batchNonce,
          response: responseContent
        })
      }
    })

    this._contract.on('BatchFailed', (batchNonce: ethers.BigNumber) => {
      const batchNonceBigint = batchNonce.toBigInt()
      const requests = this._pendingRequests.get(batchNonceBigint)
      if (requests === undefined) {
        return
      }
      for (const requestNonce of requests.map(r => ethers.BigNumber.from(r))) {
        console.log('[batch %d, request %d] BATCH FAILED', batchNonce, requestNonce)
        this._responseEmitter.emit('response', 'failure', { requestNonce, batchNonce })
      }
      this._pendingRequests.delete(batchNonceBigint)
    })
  }

  get wallet(): SapphireWallet {
    return this._wallet
  }

  async sendRequest(req: Request) {
    const { cid } = await this._ipfs.add(JSON.stringify(req))
    const timeLabel = `Processed request ${cid} in`
    console.time(timeLabel)
    console.log('request added to IPFS: %s', cid)
    const tx = await this._contract.sendRequest(multihash.parse(cid.toString()))
    const receipt = await tx.wait()
    const eventArgs = receipt.events?.find(evt => evt.event === 'RequestSubmitted')?.args
    if (!eventArgs) {
      throw new Error(`Request submission of ${cid} failed for an unknown reason`)
    }
    const [requestNonce, batchNonce]: [ethers.BigNumber, ethers.BigNumber] = [eventArgs[0], eventArgs[1]]
    return new Promise<Response>((resolve, reject) => {
      const listener = (type: string, res: EmittedResponse) => {
        if (
          res.requestNonce.toBigInt() !== requestNonce.toBigInt() ||
          res.batchNonce.toBigInt() !== batchNonce.toBigInt()
        ) {
          return
        }
        this._responseEmitter.off('response', listener)
        switch (type) {
          case 'success':
            resolve(res.response)
            break
          case 'failure':
            reject('batch consensus failed')
            break
          default:
            reject(`Unknown response type: ${type}`)
        }
        console.timeEnd(timeLabel)
      }
      this._responseEmitter.on('response', listener)
    })
  }

  async openCurrentStateDatabase(dbFile = path.resolve(os.tmpdir(), 'rpc3-client', 'db.sqlite')) {
    await fsextra.ensureDir(path.dirname(dbFile))
    const stateCid = multihash.stringify(await this._contract.getStateCid())
    await fs.promises.writeFile(dbFile, this._ipfs.cat(stateCid))
    return AsyncDatabase.open(dbFile)
  }
}
