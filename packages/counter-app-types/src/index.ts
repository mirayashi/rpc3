export type Request = {
  count: number
}

export type Response = ResponseSuccess | ResponseError

export type ResponseSuccess = {
  status: 'ok'
  newCount: number
}

export type ResponseError = {
  status: 'error'
  message: string
}

export function isRequest(payload: unknown): payload is Request {
  return typeof payload === 'object' && payload !== null && 'count' in payload && typeof payload.count === 'number'
}
