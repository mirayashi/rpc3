import { RPC3Server } from '@rpc3/server'
import { config } from './app.config.js'
import { getRequestListener } from './getRequestListener.js'

const server = await RPC3Server.create(config)
const requestListener = await getRequestListener(server)

await server.ensureIsRegistered()
server.listenToRequests(requestListener)

console.log('Server started')
