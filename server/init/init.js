import path from 'path'
import { fileURLToPath } from 'url'

import { AsyncDatabase } from 'promised-sqlite3'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default async function init() {
  const db = await AsyncDatabase.open(path.resolve(__dirname, '..', 'output', 'db.sqlite'))
  db.inner.on('trace', sql => console.log('[TRACE]', sql))

  await db.run('CREATE TABLE test(a INTEGER PRIMARY KEY AUTOINCREMENT, b)')

  await db.close()
}
