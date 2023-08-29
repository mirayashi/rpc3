import 'dotenv/config'

import { type BaseConfig, createBaseConfig } from 'rpc3-common'

export type AppConfig = BaseConfig
export const config: AppConfig = createBaseConfig()
