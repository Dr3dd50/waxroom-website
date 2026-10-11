// Visitor tracking, owned in one place: the Meta pixel (every fbq call on the site
// goes through here) and PostHog product analytics.
//
// - Each is off until configured in src/data/tracking.json (or VITE_META_PIXEL_ID).
// - No banner (US business, opt-out law): visitors whose browser sends Global Privacy
//   Control, or who opt out from the footer link, are never tracked, browser or server,
//   by either tool.
// - Writes Meta's _fbp / _fbc cookies itself, before fbevents.js loads, so a click id
//   from an ad survives even when an ad-blocker stops the pixel; the server copy of each
//   conversion then still matches the visitor.
// - Conversions carry one event id, shared with the server's copy (Conversions API),
//   so Meta keeps one of the two.
import trackingConfig from '../data/tracking.json';

const PIXEL_ID: string = import.meta.env.VITE_META_PIXEL_ID || trackingConfig.metaPixelId;
const POSTHOG = trackingConfig.posthog;
const OPT_OUT = 'wr_tracking_off';
const DEBUG = 'wr_tracking_debug'; // on localhost, tracking runs only when this is 1 (?tracking=on sets it)
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue: unknown[]; push: unknown; loaded: boolean; version: string };
declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
  interface Navigator {
    globalPrivacyControl?: boolean;
  }
}

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

/** Why tracking is on or off for this visitor. */
export function privacyState(): 'on' | 'opted-out' | 'browser-signal' | 'not-set-up' {
  if (!PIXEL_ID && !POSTHOG.key) return 'not-set-up';
  if (typeof navigator !== 'undefined' && navigator.globalPrivacyControl) return 'browser-signal';
  if (store.get(OPT_OUT) === '1') return 'opted-out';
  return 'on';
}

/** Why tracking won't run in this browser, or null when it will. */
function blockedBy(): string | null {
  if (typeof window === 'undefined') return 'server';
  const state = privacyState();
  if (state === 'not-set-up') return 'nothing is set up in src/data/tracking.json';
  if (state === 'browser-signal') return 'this browser sends Global Privacy Control (Brave, DuckDuckGo, or a privacy setting)';
  if (state === 'opted-out') return 'you opted out in the footer (Your privacy choices)';
  if (navigator.webdriver) return 'this is an automated browser';
  if (window.top !== window.self) return 'the page is inside a frame';
  if (LOCAL.test(location.hostname) && store.get(DEBUG) !== '1') return 'this is your own computer: add ?tracking=on to the address to turn it on (?tracking=off to stop)';
  return null;
}
const allowed = () => blockedBy() === null;

function readCookie(name: string) {
  for (const part of document.cookie ? document.cookie.split(';') : []) {
    const c = part.trim();
    if (c.startsWith(`${name}=`)) {
      try {
        return decodeURIComponent(c.slice(name.length + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const cookieDomain = () => (LOCAL.test(location.hostname) ? '' : `; domain=.${location.hostname.replace(/^www\./, '')}`);

/** Our own copy of Meta's cookies: a new ad click replaces _fbc, a reload keeps it. */
function ensureMetaCookies() {
  const attrs = `; path=/; max-age=${90 * 86400}${cookieDomain()}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  const now = Date.now();
  const click = /[?&]fbclid=([A-Za-z0-9_-]{1,200})(?:&|$)/.exec(location.search);
  if (click) {
    const fbc = readCookie('_fbc');
    if (!fbc || fbc.split('.')[3] !== click[1]) document.cookie = `_fbc=fb.1.${now}.${click[1]}${attrs}`;
  }
  if (!readCookie('_fbp')) document.cookie = `_fbp=fb.1.${now}.${Math.floor(Math.random() * 1e10)}${attrs}`;
}

function newEventId() {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  } catch {
    return null; // no id → no conversion event, rather than one that can't be deduplicated
  }
}

/** Meta's standard base code, loaded only once tracking is allowed. */
function loadPixel() {
  if (window.fbq) return;
  const f = function (...args: unknown[]) {
    if (f.callMethod) f.callMethod(...args);
    else f.queue.push(args);
  } as Fbq;
  f.push = f;
  f.loaded = true;
  f.version = '2.0';
  f.queue = [];
  window.fbq = window._fbq = f;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(s);
}

type PostHog = typeof import('posthog-js').default;
let posthog: PostHog | null = null;
const queued: [string, Record<string, unknown>][] = [];
/** A product-analytics event; held until PostHog has loaded. */
function capture(event: string, props: Record<string, unknown> = {}) {
  if (posthog) posthog.capture(event, props);
  else if (POSTHOG.key && allowed()) queued.push([event, props]);
}

/** PostHog, loaded as its own file so pages don't carry it for visitors who opted out. */
function startPostHog() {
  import('posthog-js').then(({ default: ph }) => {
    if (LOCAL.test(location.hostname)) console.info('[tracking] PostHog is on; events go to', POSTHOG.host);
    ph.init(POSTHOG.key, {
      api_host: POSTHOG.host,
      defaults: '2025-05-24', // pageviews and page leaves, including the booking steps
      person_profiles: 'identified_only',
      session_recording: { maskAllInputs: true }, // names, phones, emails and cards never recorded
    });
    posthog = ph;
    for (const [e, p] of queued.splice(0)) ph.capture(e, p);
  }, (err) => console.warn('[tracking] PostHog could not load (if you just pulled new code, run npm install):', err));
}

let started = false;
let metaStarted = false;
/** Once per page load: PostHog, then cookies, pixel, PageView, and the Book-tap listener. */
export function startTracking() {
  if (started) return;
  // ?tracking=on / off: try tracking on your own computer without opening the console
  const flag = new URLSearchParams(location.search).get('tracking');
  if (flag === 'on' || flag === 'off') store.set(DEBUG, flag === 'on' ? '1' : null);
  const why = blockedBy();
  if (why) {
    if (LOCAL.test(location.hostname)) console.info(`[tracking] off: ${why}`);
    return;
  }
  started = true;
  if (POSTHOG.key) startPostHog();
  // A tap on a service that books on GlossGenius: the visitor leaves the site, so the
  // event goes out now, from the browser and (by beacon, which survives the page
  // unloading) from our server.
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest?.('a[data-book-service]');
    if (a) trackBookTap(a.getAttribute('data-book-service') ?? '');
  });
  if (!PIXEL_ID) return;
  metaStarted = true;
  ensureMetaCookies();
  loadPixel();
  window.fbq!('init', PIXEL_ID);
  window.fbq!('track', 'PageView');
}

const viewed = new Set<string>();
/** A service or umbrella page was viewed (once per page load, however often it's called). */
export function trackView(name: string, category: string) {
  if (!metaStarted || !name || viewed.has(name)) return;
  viewed.add(name);
  window.fbq?.('track', 'ViewContent', { content_name: name, content_category: category });
}

export type Attribution = { consent: 'allowed' | 'denied'; fbp?: string; fbc?: string; eventId?: string };

/** Call once per attempt and send it with the request as `tracking`; the server reuses the event id. */
export function attribution(): Attribution {
  if (!allowed() || !PIXEL_ID) return { consent: 'denied' };
  const out: Attribution = { consent: 'allowed' };
  const fbp = readCookie('_fbp'), fbc = readCookie('_fbc'), id = newEventId();
  if (fbp) out.fbp = fbp;
  if (fbc) out.fbc = fbc;
  if (id) out.eventId = id;
  return out;
}

/** After the server accepted it, with the same attribution: Meta pairs the two copies. */
const PRODUCT_EVENT = { Schedule: 'booking confirmed', Subscribe: 'membership joined', Purchase: 'package bought' } as const;
export function trackConversion(name: 'Schedule' | 'Subscribe' | 'Purchase', a: Attribution, data: Record<string, unknown>) {
  if (started) capture(PRODUCT_EVENT[name], data);
  if (!metaStarted || !a.eventId) return; // a browser-only Meta copy would count on its own
  window.fbq?.('track', name, data, { eventID: a.eventId });
}

function trackBookTap(service: string) {
  capture('booking started', { service, booking_site: 'glossgenius' });
  const a = attribution();
  if (!metaStarted || !a.eventId) return;
  window.fbq?.('track', 'InitiateCheckout', { content_name: service, content_category: 'booking' }, { eventID: a.eventId });
  const body = JSON.stringify({ event: 'InitiateCheckout', tracking: a, url: location.href, service });
  try {
    if (!navigator.sendBeacon?.('/api/public/track', new Blob([body], { type: 'application/json' }))) throw new Error('no beacon');
  } catch {
    fetch('/api/public/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  }
}

/** The footer's opt-out: stops the pixel and removes Meta's cookies from this browser. */
export function setOptOut(off: boolean) {
  store.set(OPT_OUT, off ? '1' : null);
  if (off) posthog?.opt_out_capturing();
  if (off) {
    for (const name of ['_fbp', '_fbc']) {
      document.cookie = `${name}=; path=/; max-age=0${cookieDomain()}`;
      document.cookie = `${name}=; path=/; max-age=0`;
    }
  }
  location.reload();
}
