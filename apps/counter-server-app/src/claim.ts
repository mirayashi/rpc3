import { ethers } from 'ethers'
import { RPC3Server } from '@rpc3/server'
import { config } from './app.config.js'
import readline from 'readline/promises'
import { stdin, stdout, exit } from 'process'

const server = await RPC3Server.create(config)
const rl = readline.createInterface({ input: stdin, output: stdout })

const claimable = await server.getClaimableBalance()
console.log(
  `Claimable balance
    ...from contribution rewards: %s ROSE
    ...from pending payments: %s ROSE
`,
  ethers.utils.formatEther(claimable.fromContributions),
  ethers.utils.formatEther(claimable.fromPendingPayments)
)
if (claimable.fromContributions.eq(0) && claimable.fromPendingPayments.eq(0)) {
  console.log('Nothing to withdraw')
  exit(0)
}
const answer = await rl.question('Proceed to withdrawal? (y/n) [n]: ')
if (answer === 'y') {
  await server.withdrawAll()
}
exit(0)
