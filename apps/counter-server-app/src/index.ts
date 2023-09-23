import { RPC3Server } from '@rpc3/server'
import { config } from './app.config.js'
import { onRequest } from './RequestProcessor.js'

const server = await RPC3Server.create(config)

await server.ensureIsRegistered()
server.listenToRequests(onRequest)

console.log('Server started')
