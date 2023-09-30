import { RPC3Client } from '@rpc3/client'
import { Permit, PrivateComputationUnit, utils } from '@rpc3/common'

export default class StateAccess {
  private readonly _client: RPC3Client
  private readonly _pcu: PrivateComputationUnit

  constructor(client: RPC3Client, pcu: PrivateComputationUnit) {
    this._client = client
    this._pcu = pcu
  }

  async getCurrentCounter(permit: Permit) {
    const db = await this._client.openCurrentStateDatabase()
    const result: { count: string } | undefined = await db.get(
      'SELECT count FROM counter WHERE addr = ?',
      this._client.wallet.address
    )
    if (result === undefined) {
      return 0n
    }
    return utils.buf322BigInt(utils.hexString2Buf(await this._pcu.decrypt(permit, result.count)))
  }
}
