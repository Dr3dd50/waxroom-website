// Mock data for the dashboard prototype. The catalog (staff, services, prices,
// durations, memberships, packages, policies) is the real one ported from
// GlossGenius; clients, appointments, referrals and payments are made up,
// generated deterministically so every reload shows the same week.
import catalog from '../../platform/seed/catalog.json';

export { catalog };

export type Service = (typeof catalog.services)[number];
export type Staff = { id: string; name: string; short: string; color: string; role: 'owner' | 'employee'; days: number[] };

/** Who appears on the calendar. Retired accounts and the one-off event account are left out. */
const STAFF_STYLE: Record<string, Omit<Staff, 'id' | 'name'>> = {
  'Danielle W': { short: 'Danielle', color: '#E39A1E', role: 'owner', days: [0, 1, 2, 3, 4, 5, 6] },
  'Nyeesha Holley': { short: 'Nyeesha', color: '#C9728A', role: 'employee', days: [1, 2, 3, 5, 6] },
  'Chicago Chew': { short: 'Chicago', color: '#6E9A7A', role: 'employee', days: [2, 4, 6] },
};
// Owner first, then in the order above.
export const STAFF: Staff[] = Object.keys(STAFF_STYLE).map((name) => {
  const s = catalog.staff.find((x) => x.name === name)!;
  return { id: s.id, name: s.name, ...STAFF_STYLE[name] };
});

const RETIRED = new Set(['College Tours']);
export const SERVICES = catalog.services.filter((s) => !RETIRED.has(s.category ?? ''));

/** Display category: GlossGenius strays folded into body waxing. */
export const categoryOf = (s: Service) => (['Body Work', 'None', null, ''].includes(s.category) ? 'Body and Facial Waxing' : s.category!);

export const CATEGORY_COLORS: Record<string, string> = {
  'Intimate Waxing': '#FBE3A6',
  'Body and Facial Waxing': '#F6D7A8',
  'Brow Art': '#EAD3BF',
  'Lash Art': '#DCD3F2',
  'Skin Therapy': '#E3D4FF',
  'Yoni Steam': '#F5D2DC',
  'Hair Restoration': '#D3E6D7',
  'Bio scans': '#D3E2F2',
};

// ── deterministic randomness ────────────────────────────────────────────────
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];

// ── clients (fictional) ─────────────────────────────────────────────────────
const FIRST = ['Keisha', 'Amara', 'Jasmine', 'Brittany', 'Tasha', 'Morgan', 'Alicia', 'Danae', 'Kayla', 'Monique', 'Renee', 'Simone', 'Toni', 'Whitney', 'Ashley', 'Lauren', 'Jordan', 'Imani', 'Nia', 'Gabrielle', 'Destiny', 'Erica', 'Crystal', 'Tiffany', 'Carmen', 'Leah', 'Paige', 'Sierra', 'Olivia', 'Raven', 'Kendra', 'Vanessa', 'Aaliyah', 'Courtney', 'Tamika', 'Janelle', 'Bria', 'Kiara', 'Shanice', 'Ebony', 'Maya', 'Chloe', 'Hannah', 'Kim', 'Alexis', 'Taylor'];
const LAST = ['A.', 'B.', 'C.', 'D.', 'E.', 'F.', 'G.', 'H.', 'J.', 'K.', 'L.', 'M.', 'N.', 'O.', 'P.', 'R.', 'S.', 'T.', 'V.', 'W.', 'Y.'];
const MEMBERSHIP_NAMES = catalog.memberships.map((m) => m.name);

export type Client = {
  id: string;
  name: string;
  phone: string;
  email: string;
  since: string;
  visits: number;
  spent: number;
  membership: string | null;
  smsReminders: boolean;
  smsMarketing: boolean;
  referralCode: string;
  referredBy: string | null;
  notes: string;
  cardOnFile: string | null;
  credit: number;
};

export const CLIENTS: Client[] = Array.from({ length: 260 }, (_, i) => {
  const r = rng(`client${i}`);
  const first = pick(r, FIRST);
  const name = `${first} ${pick(r, LAST)}`;
  const visits = 3 + Math.floor(r() * 40);
  return {
    id: `c${i}`,
    name,
    phone: `(804) 5${String(10 + Math.floor(r() * 89))}-${String(1000 + Math.floor(r() * 8999))}`,
    email: `${first.toLowerCase()}${Math.floor(r() * 90 + 10)}@example.com`,
    since: new Date(2022 + Math.floor(r() * 4), Math.floor(r() * 12), 1 + Math.floor(r() * 27)).toISOString(),
    visits,
    spent: visits * (40 + Math.floor(r() * 60)) * 100,
    membership: r() < 0.28 ? pick(r, MEMBERSHIP_NAMES) : null,
    smsReminders: r() < 0.94,
    smsMarketing: r() < 0.62,
    referralCode: `${first.toUpperCase()}${Math.floor(r() * 90 + 10)}`,
    referredBy: null,
    notes: pick(r, ['', '', 'Prefers hard wax. Sensitive on the left side.', 'Uses tretinoin, check before facial waxing.', 'Likes a quiet appointment.', 'Running 5 min late usually; text the morning of.', 'Allergic to lavender: no lavender blend for steam.']),
    cardOnFile: r() < 0.9 ? `${pick(r, ['Visa', 'Mastercard', 'Amex'])} •• ${1000 + Math.floor(r() * 8999)}` : null,
    credit: 0,
  };
});
// A few referral links between clients (both get credit).
for (const [a, b] of [[3, 17], [3, 22], [8, 30], [12, 41], [20, 44], [20, 51], [27, 58], [33, 90], [33, 120], [33, 150], [61, 99], [74, 140]]) {
  CLIENTS[b].referredBy = CLIENTS[a].id;
}
export const clientById = (id: string) => CLIENTS.find((c) => c.id === id)!;

// ── appointments ────────────────────────────────────────────────────────────
export type Status = 'booked' | 'confirmed' | 'checked-in' | 'completed' | 'no-show' | 'cancelled';
export type Appointment = {
  id: string;
  staffId: string;
  clientId: string;
  serviceId: string;
  start: Date;
  minutes: number;
  status: Status;
  newClient: boolean;
  deposit: number | null;
  usesMembership: boolean;
  bookedOnline: boolean;
  tip: number | null;
};

export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const TODAY = startOfDay(new Date());
const HOURS = catalog.business.hours as Record<string, { start: number; end: number; working: boolean }>;
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const hoursFor = (d: Date) => HOURS[DAY_NAMES[d.getDay()]];

/** Which services each person books, weighted toward what the studio sells most. */
function menuFor(staff: Staff) {
  const own = SERVICES.filter((s) => s.staff.includes(staff.id));
  const weight = (s: Service) =>
    /^Brazilian$/.test(s.name) ? 10 : /Brazilian|Bikini|Underarm|Eyebrow|Lip|Fill|Yoni/.test(s.name) ? 4 : /Jet Plasma|Lamination|Full Set|Lower Leg/.test(s.name) ? 2 : 1;
  return own.flatMap((s) => Array(weight(s)).fill(s) as Service[]);
}

const cache = new Map<string, Appointment[]>();
export function appointmentsOn(day: Date): Appointment[] {
  const key = dayKey(day);
  if (cache.has(key)) return cache.get(key)!;
  const out: Appointment[] = [];
  const h = hoursFor(day);
  for (const staff of STAFF) {
    if (!h.working || !staff.days.includes(day.getDay())) continue;
    const r = rng(`${key}:${staff.id}`);
    const menu = menuFor(staff);
    if (!menu.length) continue;
    let t = h.start * 60 + (r() < 0.5 ? 0 : 15);
    const end = h.end * 60;
    let n = 0;
    while (t < end - 15) {
      if (r() < 0.22) {
        t += pick(r, [15, 30, 45, 60]);
        continue;
      }
      const s = pick(r, menu);
      const minutes = s.duration;
      if (t + minutes > end) break;
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, t);
      const past = start < new Date();
      const client = CLIENTS[Math.floor(r() * CLIENTS.length)];
      const newClient = s.name === 'NEW CLIENT RITUAL' || r() < 0.08;
      const roll = r();
      out.push({
        id: `${key}-${staff.short}-${n++}`,
        staffId: staff.id,
        clientId: client.id,
        serviceId: s.id,
        start,
        minutes,
        status: past ? (roll < 0.04 ? 'no-show' : roll < 0.07 ? 'cancelled' : 'completed') : roll < 0.75 ? 'confirmed' : 'booked',
        newClient,
        deposit: s.deposit && (!s.depositNewClientsOnly || newClient) ? s.deposit : null,
        usesMembership: !!client.membership && /Brazilian|Yoni|Fill|Bio scan/.test(s.name) && r() < 0.7,
        bookedOnline: r() < 0.82,
        tip: past ? Math.round((s.price ?? 0) * pick(r, [0.15, 0.2, 0.2, 0.25])) : null,
      });
      t += minutes + pick(r, [0, 0, 0, 15]);
    }
  }
  out.sort((a, b) => +a.start - +b.start);
  cache.set(key, out);
  return out;
}
export const serviceById = (id: string) => SERVICES.find((s) => s.id === id)!;
export const staffById = (id: string) => STAFF.find((s) => s.id === id)!;

// ── referrals (both get credit) ─────────────────────────────────────────────
export const REFERRAL_PROGRAM = { friendGets: 1000, referrerGets: 1000, rewardOn: 'first completed visit' };
export type Referral = { referrerId: string; friendId: string; status: 'invited' | 'booked' | 'completed'; date: Date };
export const REFERRALS: Referral[] = CLIENTS.filter((c) => c.referredBy).map((c, i) => ({
  referrerId: c.referredBy!,
  friendId: c.id,
  status: (['completed', 'completed', 'booked', 'completed', 'invited', 'booked', 'completed'] as const)[i % 7],
  date: addDays(TODAY, -3 - i * 6),
}));
for (const ref of REFERRALS) {
  if (ref.status === 'completed') {
    clientById(ref.referrerId).credit += REFERRAL_PROGRAM.referrerGets;
  }
}

// ── formatting ──────────────────────────────────────────────────────────────
export const money = (cents: number | null | undefined) =>
  cents == null ? '—' : `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export const nice = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : s);
export const duration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
