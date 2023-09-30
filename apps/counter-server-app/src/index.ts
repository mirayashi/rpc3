import { RPC3Server } from '@rpc3/server'
import { config } from './app.config.js'
import { getRequestListener } from './getRequestListener.js'

const server = await RPC3Server.create(config)
const requestListener = await getRequestListener(server)

for (;;) {
  try {
    await server.ensureIsRegistered()
    break
  } catch (err) {
    console.error('Unable to register, stake requirement changed. Retrying...')
  }
}
server.listenToRequests(requestListener)

console.log('Server started')
