/**
 * Import for its side effect: makes the global fetch retry server errors
 * (5xx, 429) and network failures, waiting 5 s, then 15 s, then 30 s.
 * NYC Open Data often answers 503 for a few seconds at a time, and one failed
 * request would otherwise leave a layer out of the deploy.
 */
const DELAYS_MS = [5_000, 15_000, 30_000];

const realFetch = globalThis.fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

globalThis.fetch = async (input, init) => {
  for (let attempt = 0; ; attempt++) {
    const last = attempt === DELAYS_MS.length;
    try {
      const res = await realFetch(input, init);
      if (last || !(res.status >= 500 || res.status === 429)) return res;
      await res.body?.cancel();
      console.warn(`  HTTP ${res.status}, retrying in ${DELAYS_MS[attempt] / 1000}s: ${String(input).slice(0, 100)}`);
    } catch (err) {
      if (last || init?.signal?.aborted) throw err;
      console.warn(`  ${err instanceof Error ? err.message : err}, retrying in ${DELAYS_MS[attempt] / 1000}s: ${String(input).slice(0, 100)}`);
    }
    await sleep(DELAYS_MS[attempt]);
  }
};
