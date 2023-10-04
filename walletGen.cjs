const { Wallet } = require('ethers')

const COUNT = parseInt(process.argv[2] || '5')

for (let i = 1; i <= COUNT; i++) {
  const wallet = Wallet.createRandom()
  console.log('Wallet %d: { address: "%s", privateKey: "%s" }', i, wallet.address, wallet.privateKey)
}
