// Minimal DataForSEO client. Credentials come from DATAFORSEO_LOGIN and
// DATAFORSEO_PASSWORD (the API login and password from app.dataforseo.com,
// not the account's sign-in). Docs: https://docs.dataforseo.com/v3/

const API = 'https://api.dataforseo.com/v3';
const OK = 20000;

let spent = 0;
/** Dollars charged so far in this process, as reported by the API. */
export const spentSoFar = () => spent;

export function hasCredentials() {
  return Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

function authHeader() {
  if (!hasCredentials()) {
    throw new Error('Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to run this script (or pass --dry-run).');
  }
  const { DATAFORSEO_LOGIN: login, DATAFORSEO_PASSWORD: password } = process.env;
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One request; returns the single task's `result` array. Retries only transient failures. */
async function call(method, path, body) {
  for (let attempt = 1; ; attempt++) {
    let res, json;
    try {
      res = await fetch(API + path, {
        method,
        headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      json = await res.json().catch(() => null);
    } catch (err) {
      if (attempt < 4) { await sleep(2000 * attempt); continue; }
      throw err;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) { await sleep(2000 * attempt); continue; }
    if (!res.ok || json?.status_code !== OK) {
      throw new Error(`DataForSEO ${path} failed (HTTP ${res.status}): ${json?.status_code} ${json?.status_message}`);
    }
    spent += json.cost ?? 0;
    const task = json.tasks?.[0];
    if (task?.status_code !== OK) {
      const err = new Error(`DataForSEO ${path} task failed: ${task?.status_code} ${task?.status_message}`);
      err.code = task?.status_code;
      throw err;
    }
    return task.result ?? [];
  }
}

/** Task status for a search that legitimately returned nothing. */
export const NO_RESULTS = 40102;

/** POST one task to a Live endpoint (Live endpoints take exactly one task per call). */
export const post = (path, task) => call('POST', path, [task]);
/** GET a reference endpoint such as a locations list (free). */
export const get = (path) => call('GET', path);

/** Run `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
