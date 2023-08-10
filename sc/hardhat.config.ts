import { HardhatUserConfig } from "hardhat/config"
import "@oasisprotocol/sapphire-hardhat"
import "@nomicfoundation/hardhat-toolbox"
import "@nomicfoundation/hardhat-chai-matchers"

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
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
      url: "https://testnet.sapphire.oasis.dev",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 0x5aff
    }
  }
}

export default config
