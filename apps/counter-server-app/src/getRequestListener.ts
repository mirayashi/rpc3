import type { RPC3Server, RequestContext } from '@rpc3/server'
import type { Response } from '@rpc3/counter-app-types'
import { isRequest } from '@rpc3/counter-app-types'
import { PCUFactory } from '@rpc3/common'
import { config } from './app.config.js'

export async function getRequestListener(server: RPC3Server) {
  const pcu = PCUFactory.connect(config.pcuContractAddress, server.wallet)

  return async ({ db, author, payload }: RequestContext): Promise<Response> => {
    if (!isRequest(payload)) {
      return { status: 'error', message: 'invalid payload' }
    }

    await db.run(
      'INSERT INTO counter(addr, count) VALUES (?, ?) ON CONFLICT(addr) DO UPDATE SET count = count + excluded.count',
      author,
      payload.count
    )
    const { count: newCount }: { count: number } = await db.get('SELECT count FROM counter WHERE addr = ?', author)
    return { status: 'ok', newCount }
  }
}
