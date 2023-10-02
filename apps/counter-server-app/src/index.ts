import { RPC3Server } from '@rpc3/server'
import { config } from './app.config.js'
import { getRequestListener } from './getRequestListener.js'

const server = await RPC3Server.create(config)
const requestListener = await getRequestListener(server)

try {
  await server.ensureIsRegistered()
} catch (err) {
  console.error('Registration failed', typeof err === 'object' && err != null && 'message' in err ? err.message : err)
  process.exit(1)
}
server.listenToRequests(requestListener)

console.log('Server started')
