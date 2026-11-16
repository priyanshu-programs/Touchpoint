// Loaded by Playwright's webServer through NODE_OPTIONS, and by nothing else. The app has
// no setting for Google's or OpenRouter's address, so a wrong setting can never send
// tokens or a key elsewhere.
const FAKE_GOOGLE = "http://127.0.0.1:3101";
const FAKE_MODEL = "http://127.0.0.1:3103";
const REROUTED = new Set(["www.googleapis.com", "oauth2.googleapis.com"]);
const isGoogle = (host) => /(^|\.)(google|googleapis)\.com$/.test(host);
const isOpenRouter = (host) => /(^|\.)openrouter\.ai$/.test(host);

const realFetch = globalThis.fetch;

function fakeFor(hostname) {
  // Fails the test rather than reaching the real service from a test run.
  if (isOpenRouter(hostname)) {
    if (hostname !== "openrouter.ai") throw new Error(`The e2e suite tried to reach ${hostname}`);
    return FAKE_MODEL;
  }
  if (!REROUTED.has(hostname)) throw new Error(`The e2e suite tried to reach ${hostname}`);
  return FAKE_GOOGLE;
}

globalThis.fetch = async function reroutedFetch(input, init) {
  const address = new URL(input instanceof Request ? input.url : input);
  if (!isGoogle(address.hostname) && !isOpenRouter(address.hostname)) {
    return realFetch(input, init);
  }

  const target = `${fakeFor(address.hostname)}${address.pathname}${address.search}`;
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
