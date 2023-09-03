import readline from 'readline/promises'
import { stdin, stdout, exit } from 'process'

import { config } from '../app.config.js'
import RPC3Client from './RPC3Client.js'

const client = await RPC3Client.create(config)

const rl = readline.createInterface({ input: stdin, output: stdout })
const input = parseInt(await rl.question('Enter any number: '))
const response = await client.sendRequest({ count: input })
console.log('Your input has been processed!', response)
rl.close()
exit(0)
