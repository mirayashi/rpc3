import 'dotenv/config'
import { HardhatUserConfig } from 'hardhat/config'
import '@oasisprotocol/sapphire-hardhat'
import '@nomicfoundation/hardhat-toolbox'
import '@nomicfoundation/hardhat-chai-matchers'

if (!process.env.HH_EXCLUDE_TASKS) {
  require('./tasks/deploy')
}

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.16',
    settings: {
      optimizer: {
        enabled: true,
        runs: 10000
      }
    }
  },
  networks: {
    sapphire_testnet: {
      // This is Testnet! If you want Mainnet, add a new network config item.
      url: 'https://testnet.sapphire.oasis.dev',
      accounts: process.env.HH_PRIVATE_KEY ? [process.env.HH_PRIVATE_KEY] : [],
      chainId: 0x5aff
    },
    hardhat: {
      accounts: {
        count: 500
      }
    }
  }
}

export default config
