import type { Request, Response } from './types.js'

export async function onRequest({ db, author, payload }: Request): Promise<Response> {
  await db.run(
    'INSERT INTO counter(addr, count) VALUES (?, ?) ON CONFLICT(addr) DO UPDATE SET count = count + excluded.count',
    author,
    payload.count
  )
  const { count: newCount }: { count: number } = await db.get('SELECT count FROM counter WHERE addr = ?', author)
  return { status: 'ok', newCount }
}
