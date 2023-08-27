import { ethers } from 'ethers'
import * as sapphire from '@oasisprotocol/sapphire-paratime'

import ConfigBuilder from './ConfigBuilder'
import { requireEnv } from './requireEnv'

export type BaseConfig = {
  env: string
  ethersProvider: ethers.providers.BaseProvider
  contractAddress: string
  walletPrivateKey: string
  ipfsRpcUrl: string
}

export function createBaseConfig(): BaseConfig {
  const config = ConfigBuilder.create<BaseConfig>()
    .withDefaultValues({
      contractAddress: requireEnv('CONTRACT_ADDRESS'),
      walletPrivateKey: requireEnv('WALLET_PRIVATE_KEY'),
      ipfsRpcUrl: process.env.IPFS_RPC_URL || 'http://localhost:5001'
    })
    .addDefinition('local', {
      ethersProvider: ethers.getDefaultProvider(sapphire.NETWORKS.localnet.defaultGateway)
    })
    .addDefinition('development', {
      ethersProvider: ethers.getDefaultProvider(sapphire.NETWORKS.testnet.defaultGateway)
    })
    .addDefinition('production', {
      ethersProvider: ethers.getDefaultProvider(sapphire.NETWORKS.mainnet.defaultGateway)
    })
    .build(requireEnv('APP_ENV'))

  if (config === undefined) {
    throw new Error(
      'Config not found for this environment. Check that APP_ENV environment variable is defined properly.'
    )
  }
  return config
}
