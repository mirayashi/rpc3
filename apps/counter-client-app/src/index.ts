import readline from 'readline/promises'
import { stdin, stdout, exit } from 'process'

import { RPC3Client } from '@rpc3/client'

import { config } from './app.config.js'
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
try {
  const response = await client.sendRequest({ count: input })
  if (
    typeof response === 'object' &&
    response !== null &&
    'status' in response &&
    'newCount' in response &&
    response.status === 'ok'
  ) {
    console.log('Your counter was incremented successfully! It is now %d', response.newCount)
  }
} catch (err) {
  console.error(typeof err === 'object' && err !== null && 'message' in err ? err.message : err)
  exit(1)
} finally {
  rl.close()
}
exit(0)
