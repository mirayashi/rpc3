import type { RPC3Server, RequestContext } from '@rpc3/server'
import type { Response } from '@rpc3/counter-app-types'
import { isRequest } from '@rpc3/counter-app-types'
import { PCUFactory } from '@rpc3/common'
import { config } from './app.config.js'
import { BytesLike } from 'ethers'

export async function getRequestListener(server: RPC3Server) {
  const pcu = PCUFactory.connect(config.pcuContractAddress, server.wallet)
  return async ({ db, author, payload }: RequestContext): Promise<Response> => {
    if (!isRequest(payload)) {
      return { status: 'error', message: 'invalid payload' }
    }
    const current: { count: string } | undefined = await db.get('SELECT count FROM counter WHERE addr = ?', author)
    let newCount: BytesLike
    if (current === undefined) {
      newCount = payload.count
      await db.run('INSERT INTO counter(addr, count) VALUES (?, ?)', author, newCount)
    } else {
      newCount = await pcu.incrementCounter(current.count, payload.count)
      await db.run('UPDATE counter SET count = ? WHERE addr = ?', newCount, author)
    }
    return { status: 'ok', newCount }
  }
}
