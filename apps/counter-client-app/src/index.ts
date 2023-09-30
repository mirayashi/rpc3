import readline from 'readline/promises'
import { stdin, stdout, exit } from 'process'

import { RPC3Client } from '@rpc3/client'

import { config } from './app.config.js'
import StateAccess from './StateAccess.js'
import { PCUFactory, utils, PermitManager } from '@rpc3/common'
import acquireEncryptionKey from './acquireEncryptionKey.js'

const rl = readline.createInterface({ input: stdin, output: stdout })
const client = await RPC3Client.create(config)
const pcu = PCUFactory.connect(config.pcuContractAddress, client.wallet)
const pcuPermit = await new PermitManager(pcu, client.wallet).acquirePermit()
const stateAccess = new StateAccess(client, pcu)

const currentCounter = await stateAccess.getCurrentCounter(pcuPermit)
const input = BigInt(
  await rl.question(
    `Your current counter is at ${currentCounter.toString()}. How much do you want to increment it by? Enter any number: `
  )
)
try {
  const keyNonce = await acquireEncryptionKey(pcu)
  console.log('Acquired key %s', keyNonce.toHexString())
  const cipheredInput = await pcu.encrypt(pcuPermit, keyNonce, utils.bigInt2Buf32(input))
  console.log('Encrypted input: %s', cipheredInput)
  const response = await client.sendRequest({ count: cipheredInput })
  if (
    typeof response === 'object' &&
    response !== null &&
    'status' in response &&
    'newCount' in response &&
    typeof response.newCount === 'string' &&
    response.status === 'ok'
  ) {
    console.log('Received encrypted output %s, decrypting...', response.newCount)
    const decryptedResult = utils.buf322BigInt(utils.hexString2Buf(await pcu.decrypt(pcuPermit, response.newCount)))
    console.log('Your counter was incremented successfully! It is now %s', decryptedResult.toString())
  }
} catch (err) {
  console.error(err)
  exit(1)
} finally {
  rl.close()
}
exit(0)
