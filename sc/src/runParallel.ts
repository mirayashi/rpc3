export default async function runParallel(nTimes: number, promiseSupplier: (i: number) => Promise<void>) {
  const parallelism = 500
  const promises: Promise<void>[] = []
  for (let c = 0; c < parallelism; c++) {
    promises.push(
      (async () => {
        for (let n = c; n < nTimes; n += parallelism) {
          await promiseSupplier(n)
        }
      })()
    )
  }
  await Promise.allSettled(promises)
}
