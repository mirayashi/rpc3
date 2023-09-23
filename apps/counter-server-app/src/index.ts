import { utils } from '@rpc3/common'
import { config } from './app.config.js'
import RPC3Server from './RPC3Server.js'
import { onRequest } from './RequestProcessor.js'

const server = await RPC3Server.create(config)
await server.ensureIsRegistered()

server.contract.on('NextBatchReady', async () => {
  await utils.nextBlock(config.ethersProvider)
  await server.processBatch(onRequest)
})

await server.processBatch(onRequest)

console.log('Server started')
