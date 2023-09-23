export function requireEnv(varName: string): string {
  const envVar = process.env[varName]
  if (envVar === undefined) {
    throw new Error(`Missing required environment variable ${varName}`)
  }
  return envVar
}
