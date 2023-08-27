export type ConfigDefinition<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K | 'env'>
export type Config<T, K extends keyof T> = Pick<T, K> & Omit<T, K | 'env'> & { env: string }

export default class ConfigBuilder<T, O extends keyof T> {
  private defaultConfig: Pick<T, O>
  private definitionsByEnv: Map<string, Config<T, O>>

  private constructor(defaultConfig: Pick<T, O>) {
    this.defaultConfig = defaultConfig
    this.definitionsByEnv = new Map()
  }

  static create<T>() {
    return new ConfigBuilder<T, never>({})
  }

  withDefaultValues<O extends Exclude<keyof T, 'env'>>(defaultValues: Pick<T, O>): ConfigBuilder<T, O> {
    return new ConfigBuilder(defaultValues)
  }

  addDefinition(env: string, config: ConfigDefinition<T, O>): Omit<this, 'withDefaultValues'> {
    this.definitionsByEnv.set(env, {
      ...this.defaultConfig,
      ...config,
      env
    })
    return this
  }

  build(actualEnv: string | undefined): Config<T, O> | undefined {
    if (actualEnv === undefined) {
      return undefined
    }
    return this.definitionsByEnv.get(actualEnv)
  }
}
