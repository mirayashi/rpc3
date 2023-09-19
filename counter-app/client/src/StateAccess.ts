import RPC3Client from './RPC3Client'

export default class StateAccess {
  private readonly _client: RPC3Client

  constructor(client: RPC3Client) {
    this._client = client
  }

  async getCurrentCounter() {
    const db = await this._client.openCurrentStateDatabase()
    const result: { count: number } | undefined = await db.get(
      'SELECT count FROM counter WHERE addr = ?',
      this._client.wallet.address
    )
    return result?.count ?? 0
  }
}
