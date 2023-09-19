import type { Permit, SapphireWallet } from './types'
import type { SignedPermitChecker } from '../generated/contracts/common/SignedPermitChecker'
import { createPermit } from './utils'

const TTL = 3600000
const MARGIN = 60000

export class PermitManager {
  private readonly _contract: SignedPermitChecker
  private readonly _wallet: SapphireWallet
  private _permit?: Permit
  private _permitExpiresAt: number = 0
  private _permitNonce: number = 0

  constructor(contract: SignedPermitChecker, wallet: SapphireWallet) {
    this._contract = contract
    this._wallet = wallet
  }

  async acquirePermit(): Promise<Permit> {
    if (this._permit === undefined || Date.now() > this._permitExpiresAt) {
      this._permitExpiresAt = Date.now() + TTL - MARGIN
      this._permit = await createPermit(this._contract, this._wallet, this._permitNonce++)
    }
    return this._permit
  }
}
