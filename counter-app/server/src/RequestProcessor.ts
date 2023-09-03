import type { Response } from 'rpc3-common'
import type { RequestContext } from './RPC3Server'

export async function onRequest({ db, author, payload }: RequestContext): Promise<Response> {
  await db.run(
    'INSERT INTO counter(addr, count) VALUES (?, ?) ON CONFLICT(addr) DO UPDATE SET count = count + excluded.count',
    author,
    payload.count
  )
  const { count: newCount }: { count: number } = await db.get('SELECT count FROM counter WHERE addr = ?', author)
  return { status: 'ok', newCount }
}
