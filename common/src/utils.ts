export async function asyncIterableToString(input: AsyncIterable<Uint8Array>) {
  const decoder = new TextDecoder('utf8')
  let result = ''
  for await (const buf of input) {
    result += decoder.decode(buf, { stream: true })
  }
  return result + decoder.decode()
}
