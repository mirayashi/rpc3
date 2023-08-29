import type { AsyncDatabase } from 'promised-sqlite3'

export type Request = {
  db: AsyncDatabase
  author: string
  payload: RequestPayload
}

export type RequestPayload = {
  count: number
}

export type Response = {
  status: string
  newCount: number
}
