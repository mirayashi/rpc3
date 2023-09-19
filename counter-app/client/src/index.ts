import readline from 'readline/promises'
import { stdin, stdout, exit } from 'process'

import { config } from '../app.config.js'
import RPC3Client from './RPC3Client.js'
import StateAccess from './StateAccess.js'

const client = await RPC3Client.create(config)
const rl = readline.createInterface({ input: stdin, output: stdout })
const stateAccess = new StateAccess(client)

const currentCounter = await stateAccess.getCurrentCounter()
const input = parseInt(
  await rl.question(
    `Your current counter is at ${currentCounter}. How much do you want to increment it by? Enter any number: `
  )
)
const response = await client.sendRequest({ count: input })
if (response.status === 'ok') {
  console.log('Your counter was incremented successfully! It is now %d', response.newCount)
}
rl.close()
exit(0)
