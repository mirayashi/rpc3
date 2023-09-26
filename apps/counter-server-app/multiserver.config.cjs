require('dotenv').config()

const script = 'node ./dist/index.js'
module.exports = {
  apps: [
    {
      name: 'server-1',
      script
    },
    {
      name: 'server-2',
      script,
      env: {
        WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY_2
      }
    },
    {
      name: 'server-3',
      script,
      env: {
        WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY_3
      }
    },
    {
      name: 'server-4',
      script,
      env: {
        WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY_4
      }
    }
  ]
}
