// Loaded by Playwright's webServer through NODE_OPTIONS, and by nothing else. The app has
// no setting for Google's address, so a wrong setting can never send tokens elsewhere.
const FAKE = "http://127.0.0.1:3101";
const REROUTED = new Set(["www.googleapis.com", "oauth2.googleapis.com"]);
const isGoogle = (host) => /(^|\.)(google|googleapis)\.com$/.test(host);

const realFetch = globalThis.fetch;

globalThis.fetch = async function reroutedFetch(input, init) {
  const address = new URL(input instanceof Request ? input.url : input);
  if (!isGoogle(address.hostname)) return realFetch(input, init);
  // Fails the test rather than reaching the real Google from a test run.
  if (!REROUTED.has(address.hostname)) {
    throw new Error(`The e2e suite tried to reach ${address.hostname}`);
  }

  const target = `${FAKE}${address.pathname}${address.search}`;
  if (!(input instanceof Request)) return realFetch(target, init);
  const hasBody = input.method !== "GET" && input.method !== "HEAD";
  return realFetch(target, {
    method: input.method,
    headers: input.headers,
    body: hasBody ? await input.arrayBuffer() : undefined,
    redirect: input.redirect,
    signal: input.signal,
    ...init,
  });
};
