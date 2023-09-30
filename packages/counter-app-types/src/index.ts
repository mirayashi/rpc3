import { BytesLike } from 'ethers'

export type Request = {
  count: BytesLike
}

export type Response = ResponseSuccess | ResponseError

export type ResponseSuccess = {
  status: 'ok'
  newCount: BytesLike
}

export type ResponseError = {
  status: 'error'
  message: string
}

export function isRequest(payload: unknown): payload is Request {
  return typeof payload === 'object' && payload !== null && 'count' in payload && typeof payload.count === 'string'
}
