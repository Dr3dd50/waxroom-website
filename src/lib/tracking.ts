// Meta pixel, owned in one place. Every fbq call on the site goes through here.
//
// - Off until a pixel id is set in src/data/tracking.json (or VITE_META_PIXEL_ID).
// - No banner (US business, opt-out law): visitors whose browser sends Global Privacy
//   Control, or who opt out from the footer link, are never tracked, browser or server.
// - Writes Meta's _fbp / _fbc cookies itself, before fbevents.js loads, so a click id
//   from an ad survives even when an ad-blocker stops the pixel; the server copy of each
//   conversion then still matches the visitor.
// - Conversions carry one event id, shared with the server's copy (Conversions API),
//   so Meta keeps one of the two.
import trackingConfig from '../data/tracking.json';

const PIXEL_ID: string = import.meta.env.VITE_META_PIXEL_ID || trackingConfig.metaPixelId;
const OPT_OUT = 'wr_tracking_off';
const DEBUG = 'wr_tracking_debug'; // set to 1 in localStorage to try it on localhost

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
  if (!PIXEL_ID) return 'not-set-up';
  if (typeof navigator !== 'undefined' && navigator.globalPrivacyControl) return 'browser-signal';
  if (store.get(OPT_OUT) === '1') return 'opted-out';
  return 'on';
}

function allowed() {
  if (typeof window === 'undefined' || privacyState() !== 'on') return false;
  if (navigator.webdriver || window.top !== window.self) return false; // bots, embeds
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && store.get(DEBUG) !== '1') return false;
  return true;
}

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

const cookieDomain = () => (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? '' : `; domain=.${location.hostname.replace(/^www\./, '')}`);

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

let started = false;
/** Once per page load: cookies, pixel, PageView, and the Book-tap listener. */
export function startTracking() {
  if (started || !allowed()) return;
  started = true;
  ensureMetaCookies();
  loadPixel();
  window.fbq!('init', PIXEL_ID);
  window.fbq!('track', 'PageView');
  // A tap on a service that books on GlossGenius: the visitor leaves the site, so the
  // event goes out now, from the browser and (by beacon, which survives the page
  // unloading) from our server.
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest?.('a[data-book-service]');
    if (a) trackBookTap(a.getAttribute('data-book-service') ?? '');
  });
}

const viewed = new Set<string>();
/** A service or umbrella page was viewed (once per page load, however often it's called). */
export function trackView(name: string, category: string) {
  if (!started || !name || viewed.has(name)) return;
  viewed.add(name);
  window.fbq?.('track', 'ViewContent', { content_name: name, content_category: category });
}

export type Attribution = { consent: 'allowed' | 'denied'; fbp?: string; fbc?: string; eventId?: string };

/** Call once per attempt and send it with the request as `tracking`; the server reuses the event id. */
export function attribution(): Attribution {
  if (!allowed()) return { consent: 'denied' };
  const out: Attribution = { consent: 'allowed' };
  const fbp = readCookie('_fbp'), fbc = readCookie('_fbc'), id = newEventId();
  if (fbp) out.fbp = fbp;
  if (fbc) out.fbc = fbc;
  if (id) out.eventId = id;
  return out;
}

/** After the server accepted it, with the same attribution: Meta pairs the two copies. */
export function trackConversion(name: 'Schedule' | 'Subscribe' | 'Purchase', a: Attribution, data: Record<string, unknown>) {
  if (!started || !a.eventId) return; // a browser-only copy would count on its own
  window.fbq?.('track', name, data, { eventID: a.eventId });
}

function trackBookTap(service: string) {
  const a = attribution();
  if (!started || !a.eventId) return;
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
  if (off) {
    for (const name of ['_fbp', '_fbc']) {
      document.cookie = `${name}=; path=/; max-age=0${cookieDomain()}`;
      document.cookie = `${name}=; path=/; max-age=0`;
    }
  }
  location.reload();
}
