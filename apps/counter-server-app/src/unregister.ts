import { RPC3Server } from '@rpc3/server'
import { config } from './app.config.js'
import readline from 'readline/promises'
import { stdin, stdout, exit } from 'process'

const server = await RPC3Server.create(config)
const rl = readline.createInterface({ input: stdin, output: stdout })

const globalParams = await server.contract.globalParams()
const answer = await rl.question(`Are you sure you want to unregister? This will cost you 
${globalParams.slashPercent}% of the amount you staked when registering. (y/n) [n]: `)
if (answer === 'y') {
  const tx = await server.contract.serverUnregister()
  await tx.wait()
  console.log("Unregistration complete. You may withdraw your staked tokens using 'npm run claim'.")
}
exit(0)
