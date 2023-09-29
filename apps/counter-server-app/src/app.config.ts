import 'dotenv/config'

import { type BaseConfig, createBaseConfig, requireEnv } from '@rpc3/common'

export type AppConfig = BaseConfig & {
  pcuContractAddress: string
}

export const config: AppConfig = {
  ...createBaseConfig(),
  pcuContractAddress: requireEnv('PCU_CONTRACT_ADDRESS')
}
