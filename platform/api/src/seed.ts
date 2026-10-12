// First-run setup: the real catalog ported from GlossGenius becomes services,
// staff, memberships, packages and settings. Local demos also get sample
// clients and appointments so every screen has something to show.
import { scryptSync, randomBytes } from 'node:crypto';
import { config } from './config';
import type { Store } from './store/store';
import type { Appointment, Client, Membership, Package, Service, Settings, Staff } from './types';
import { addDays, zoned, zonedToUtc } from './lib/time';
import { rid } from './lib/util';

// bundled into the Lambda by esbuild
import catalog from '../../seed/catalog.json';
import ritualBank from '../../../src/data/rituals.json';

export function hashPassword(pw: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 32).toString('hex')}`;
}

// GlossGenius strays folded into a real category; event and retired accounts left out.
const CATEGORY_MERGE: Record<string, string> = { 'Body Work': 'Body and Facial Waxing', None: 'Body and Facial Waxing', '': 'Body and Facial Waxing' };
const SKIP_CATEGORIES = new Set(['College Tours']);
const SKIP_STAFF = new Set(['College Tours', 'Shae Haskins']);
const STAFF_LOOK: Record<string, { short: string; color: string; role: 'owner' | 'employee'; bookable?: boolean }> = {
  'Danielle W': { short: 'Danielle', color: '#E39A1E', role: 'owner' },
  'Nyeesha Holley': { short: 'Nyeesha', color: '#C9728A', role: 'employee' },
  // online booking is switched off on Chicago's GlossGenius profile; she takes wig installs, so it's on here
  'Chicago Chew': { short: 'Chicago', color: '#6E9A7A', role: 'employee', bookable: true },
};
// The first "before your visit" note from each service page, texted with the reminder.
const PREP: Record<string, string> = {
  'Intimate Waxing': 'Let hair grow to about ¼ inch and skip lotion on the area.',
  'Body and Facial Waxing': 'Let hair grow to about ¼ inch and skip lotion on the area.',
  'Brow Art': 'Skip tweezing before your appointment.',
  'Lash Art': 'Come with clean lashes: no mascara or oily makeup remover.',
  'Skin Therapy': 'Pause retinoids and exfoliating acids, and tell us if you’re pregnant or have a pacemaker.',
  'Yoni Steam': 'Drink water before your session. Skip steaming if you’re pregnant or on your period.',
  'Hair Restoration': 'Come with clean, product-free hair and scalp.',
};

export const DEFAULT_AUTOMATIONS: Settings['automations'] = {
  booking: { enabled: true, text: 'Hi {first}! You’re booked for {service} with {staff} on {date} at {time}. Add it to your calendar: {calendar_link} Manage your booking: {manage_link}' },
  moved: { enabled: true, text: 'Hi {first}, your {service} is now {date} at {time} with {staff}. Update your calendar: {calendar_link} Manage your booking: {manage_link}' },
  'confirm-request': {
    enabled: true,
    text: 'Hi {first}, see you {day} at {time} for {service}. Reply C to confirm. Need to change it? {manage_link} Cancellations within {window} hours are charged {fee}%.',
  },
  reminder: { enabled: true, text: 'Reminder: {service} tomorrow at {time} at The Wax Room, 11162 Hull Street Rd N. {prep_tip}' },
  receipt: { enabled: true, text: 'Thanks {first}! You paid {total}. Share your link and you both get {referral_amount}: {referral_link}' },
  rebook: { enabled: true, text: 'Hi {first}, it’s been about {weeks} weeks since your {service}, the right time for the next one. Book here: {booking_link}' },
  referral: { enabled: true, text: '{friend} just had their first visit. {amount} credit is on your account for next time. Thank you!' },
  birthday: { enabled: true, text: 'Happy birthday, {first}! From all of us at The Wax Room.' },
  cancel: { enabled: true, text: 'Your {service} on {date} at {time} is cancelled.{fee_note} Book again anytime: {booking_link}' },
};

// Texts the first deploy was seeded with; an untouched one is replaced by today's default.
const PREVIOUS_DEFAULTS: Record<string, string[]> = {
  booking: ['Hi {first}! You’re booked for {service} with {staff} on {date} at {time}. Manage your booking: {manage_link}'],
  rebook: ['Hi {first}, it’s been about 6 weeks since your {service}. Ready for the next one? {booking_link}'],
};

/**
 * When to nudge a client to rebook, from what each service page tells clients:
 * waxing every 3–5 weeks, brows every 3–4, lash fills every 2–3, lamination 6–8,
 * anything else about 6 weeks. The nudge goes at the start of the range, so there's
 * time to book inside it. The owner can change it per service.
 */
export function defaultRebookDays(s: Pick<Service, 'name' | 'category'>): number {
  if (s.category === 'Lash Art') return /fill|full set/i.test(s.name) ? 14 : 42;
  if (s.category === 'Brow Art') return /lamination/i.test(s.name) ? 42 : 21;
  if (s.category === 'Intimate Waxing' || s.category === 'Body and Facial Waxing') return 28;
  return 42;
}

// Lengths the owner confirmed where GlossGenius's setting is wrong.
const LENGTH_FIX: Record<string, number> = { 'Luxury Wig Installation': 60, 'Jet Plasma Facial': 60, 'Jet Plasma Body Treatment': 60 };

/**
 * The New Client Rituals (src/data/rituals.json, from the content repo's offer bank)
 * as bookable services: the service plus the complimentary steam, so the steam's
 * length is added. The Brazilian one already exists, ported from GlossGenius as
 * NEW CLIENT RITUAL; it takes the ritual's settings rather than becoming a second
 * service. Only adds what's missing: a ritual the owner has since edited stays as is.
 */
async function addRituals(store: Store) {
  const services = await store.list<Service>('services');
  const byName = (n: string) => services.find((s) => s.name.toLowerCase() === n.toLowerCase());
  for (const r of ritualBank.rituals) {
    const base = byName(r.service);
    if (!base) continue;
    const existing = services.find((s) => s.ritualOf === base.id) ?? (r.key === 'new_client_ritual' ? byName('NEW CLIENT RITUAL') : undefined);
    if (existing?.ritualOf) continue;
    const ritual: Service = {
      ...(existing ?? {}),
      id: existing?.id ?? `ritual-${r.key.replace(/_/g, '-')}`,
      name: existing?.name ?? r.name,
      category: base.category,
      order: existing?.order ?? base.order,
      price: r.price,
      priceVaries: false,
      duration: base.duration + ritualBank.steamMinutes,
      deposit: r.deposit,
      depositNewClientsOnly: false,
      description: r.includes,
      staffIds: existing?.staffIds.length ? existing.staffIds : base.staffIds,
      active: true,
      bookableOnline: existing?.bookableOnline ?? base.bookableOnline,
      prepTip: base.prepTip,
      rebookAfterDays: base.rebookAfterDays,
      ritualOf: base.id,
    };
    await store.put('services', ritual);
  }
}

/** Bring a store seeded by an earlier version up to date. Safe to run on every start. */
export async function upgrade(store: Store) {
  const s = await store.get<Settings>('settings', 'settings');
  if (!s) return;
  const before = JSON.stringify(s);
  // local demos run switched over; on AWS the owner switches after the GlossGenius import
  if (!s.switchover) s.switchover = { done: s.onlineBooking?.open ?? config.demoData };
  delete s.onlineBooking;
  s.staffAlerts ??= { enabled: true };
  s.privacy ??= { employeesSeeContact: false };
  for (const [key, def] of Object.entries(DEFAULT_AUTOMATIONS)) {
    const cur = s.automations[key];
    if (!cur) s.automations[key] = def;
    else if (PREVIOUS_DEFAULTS[key]?.includes(cur.text)) s.automations[key] = { ...cur, text: def.text };
  }
  if (JSON.stringify(s) !== before) await store.put('settings', s);
  for (const svc of await store.list<Service>('services')) {
    let next = svc;
    if (svc.rebookAfterDays === undefined) next = { ...next, rebookAfterDays: defaultRebookDays(svc) };
    // a length still at GlossGenius's wrong setting takes the confirmed one
    const fixed = LENGTH_FIX[svc.name];
    const ported = catalog.services.find((c: { id: string }) => c.id === svc.id) as { duration: number } | undefined;
    if (fixed && ported && svc.duration === ported.duration && svc.duration !== fixed) next = { ...next, duration: fixed };
    if (next !== svc) await store.put('services', next);
  }
  await addRituals(store);
}

export async function seed(store: Store) {
  const staffByGg = new Map<string, Staff>();
  for (const s of catalog.staff) {
    if (SKIP_STAFF.has(s.name)) continue;
    const look = STAFF_LOOK[s.name] ?? { short: s.name.split(' ')[0], color: '#9C8A76', role: 'employee' as const };
    const staff: Staff = {
      id: rid(),
      name: s.name,
      short: look.short,
      email: look.role === 'owner' ? config.owner.email : config.demoData ? `${look.short.toLowerCase()}@demo.local` : '',
      role: look.role,
      color: look.color,
      active: true,
      bookable: look.bookable ?? s.bookable,
    };
    if (look.role === 'owner' && config.owner.password) staff.passwordHash = hashPassword(config.owner.password);
    else if (config.demoData) staff.passwordHash = hashPassword('waxroom-demo');
    staffByGg.set(s.id, staff);
    await store.put('staff', staff);
  }

  for (const s of catalog.services) {
    if (SKIP_CATEGORIES.has(s.category ?? '')) continue;
    const category = CATEGORY_MERGE[s.category ?? ''] ?? s.category;
    const staffIds = s.staff.map((g: string) => staffByGg.get(g)?.id).filter(Boolean) as string[];
    const service: Service = {
      id: s.id,
      name: s.name,
      category,
      order: s.order,
      price: s.price,
      priceVaries: s.priceVaries,
      duration: LENGTH_FIX[s.name] ?? s.duration,
      deposit: s.deposit,
      depositNewClientsOnly: s.depositNewClientsOnly,
      description: s.description,
      staffIds,
      active: true,
      bookableOnline: staffIds.some((id) => [...staffByGg.values()].find((x) => x.id === id)?.bookable),
      prepTip: PREP[category],
    };
    service.rebookAfterDays = defaultRebookDays(service);
    await store.put('services', service);
  }

  // Luxe Lash Pass: GlossGenius has one of each fill length; the description's
  // "saving up to $50 every month" only works as a 1-week fill every week
  // (4 × $45 = $180 for $125), the basic fill, so that's what it includes.
  const oneWeekFill = catalog.services.find((s: { name: string }) => s.name === '1 Week Fill')?.id;
  for (const m of catalog.memberships) {
    const membership: Membership = {
      id: m.id,
      name: m.name,
      description: m.description,
      price: m.price,
      includes:
        m.name === 'Luxe Lash Pass' && oneWeekFill
          ? [{ serviceId: oneWeekFill, quantity: 4 }]
          : m.includes.filter((i: { serviceId?: string }) => i.serviceId).map((i: { serviceId: string; quantity: number }) => ({ serviceId: i.serviceId, quantity: i.quantity })),
      active: true,
      public: m.public,
    };
    await store.put('memberships', membership);
  }
  for (const p of catalog.packages) {
    const pkg: Package = {
      id: p.id,
      name: p.name,
      price: p.price,
      items: p.items.map((i: { serviceId: string; quantity: number }) => ({ serviceId: i.serviceId, quantity: i.quantity })),
      expiresMonths: p.expires === 'P1Y' ? 12 : null,
      active: true,
    };
    await store.put('packages', pkg);
  }

  const settings: Settings = {
    id: 'settings',
    timezone: catalog.business.timezone,
    hours: catalog.business.hours,
    policies: {
      cancellationPolicy: catalog.policies.cancellationPolicy,
      cancellationWindowHours: catalog.policies.cancellationWindowHours,
      cancellationFeePercent: catalog.policies.cancellationFeePercent,
      noShowFeePercent: 100,
      allowOnlineCancellations: catalog.policies.allowOnlineCancellations,
      cardRequired: catalog.policies.cardRequired === 'always_require',
      futureBookingsLimit: catalog.policies.futureBookingsLimit,
      defaultTipPercent: catalog.policies.defaultGratuityPercent,
      leadTimeMinutes: 60,
      bookAheadDays: 90,
      slotStepMinutes: 15,
    },
    notifications: { confirmHoursBefore: 72, reminderHoursBefore: 24, rebookAfterDays: 42, quietStart: 21, quietEnd: 9 },
    automations: DEFAULT_AUTOMATIONS,
    referrals: { enabled: true, friendGets: 1000, referrerGets: 1000 },
    // local demos run switched over; on AWS the owner switches after the GlossGenius import
    switchover: { done: config.demoData },
    staffAlerts: { enabled: true },
    privacy: { employeesSeeContact: false },
  };
  await store.put('settings', settings);

  if (config.demoData) await seedDemo(store, [...staffByGg.values()], settings);
}

// ── sample data for local demos (never on AWS) ───────────────────────────────
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
const FIRST = ['Keisha', 'Amara', 'Jasmine', 'Brittany', 'Tasha', 'Morgan', 'Alicia', 'Danae', 'Kayla', 'Monique', 'Renee', 'Simone', 'Toni', 'Whitney', 'Ashley', 'Lauren', 'Jordan', 'Imani', 'Nia', 'Gabrielle', 'Destiny', 'Erica', 'Crystal', 'Tiffany', 'Carmen', 'Leah', 'Paige', 'Sierra', 'Olivia', 'Raven', 'Kendra', 'Vanessa', 'Aaliyah', 'Courtney', 'Tamika', 'Janelle', 'Bria', 'Kiara', 'Shanice', 'Ebony', 'Maya', 'Chloe', 'Hannah', 'Alexis', 'Taylor'];
const LAST = ['Adams', 'Brooks', 'Carter', 'Davis', 'Ellis', 'Foster', 'Green', 'Harris', 'Jackson', 'King', 'Lewis', 'Morris', 'Nelson', 'Owens', 'Parker', 'Reed', 'Scott', 'Turner', 'Vaughn', 'Walker', 'Young'];

async function seedDemo(store: Store, staff: Staff[], settings: Settings) {
  const services = await store.list<Service>('services');
  const memberships = await store.list<Membership>('memberships');
  const clients: Client[] = [];
  for (let i = 0; i < 220; i++) {
    const r = rng(`client${i}`);
    const first = pick(r, FIRST);
    const code = `${first.toUpperCase()}${10 + i}`;
    const client: Client = {
      id: rid(),
      first,
      last: pick(r, LAST),
      phone: `+1804555${String(1000 + i).padStart(4, '0')}`,
      email: `${first.toLowerCase()}${i}@example.com`,
      notes: pick(r, ['', '', '', 'Prefers hard wax. Sensitive on the left side.', 'Uses tretinoin: check before facial waxing.', 'Allergic to lavender: no lavender blend for steam.']),
      createdAt: new Date(Date.now() - (30 + Math.floor(r() * 900)) * 86400000).toISOString(),
      smsReminders: r() < 0.95,
      smsMarketing: r() < 0.6,
      card: r() < 0.9 ? { brand: pick(r, ['Visa', 'Mastercard', 'Amex']), last4: String(1000 + Math.floor(r() * 8999)), paymentMethodId: `pm_sim_${rid()}` } : undefined,
      credit: 0,
      referralCode: code,
      birthday: `${String(1 + Math.floor(r() * 12)).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`,
    };
    if (r() < 0.22) {
      const m = pick(r, memberships);
      client.membership = { membershipId: m.id, since: client.createdAt, status: 'active', periodStart: new Date(Date.now() - Math.floor(r() * 28) * 86400000).toISOString() };
    }
    clients.push(client);
  }
  // a few referral links (both get credit once the friend visits)
  const pairs = [[3, 17], [3, 22], [8, 30], [12, 41], [20, 44], [20, 51], [27, 58], [33, 90], [33, 120], [61, 99]];

  const today = zoned(new Date()).day;
  const now = Date.now();
  for (let off = -42; off <= 21; off++) {
    const day = addDays(today, off);
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    const h = settings.hours[['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dow]];
    if (!h?.working) continue;
    for (const s of staff) {
      const works = s.role === 'owner' || (s.short === 'Nyeesha' ? [1, 2, 3, 5, 6].includes(dow) : [2, 4, 6].includes(dow));
      if (!works) continue;
      const r = rng(`${day}:${s.short}`);
      const menu = services.filter((x) => x.staffIds.includes(s.id));
      const weighted = menu.flatMap((x) => Array(/^Brazilian$/.test(x.name) ? 10 : /Brazilian|Bikini|Underarm|Eyebrow|Lip|Fill|Yoni/.test(x.name) ? 4 : 1).fill(x) as Service[]);
      let t = h.start * 60 + (r() < 0.5 ? 0 : 15);
      // fill the future more lightly: the rest is still open to book
      const density = off > 0 ? 0.45 : 0.22;
      while (t < h.end * 60 - 15) {
        if (r() < density) {
          t += pick(r, [15, 30, 45, 60]);
          continue;
        }
        const sv = pick(r, weighted);
        if (t + sv.duration > h.end * 60) break;
        const start = zonedToUtc(day, t);
        const end = new Date(start.getTime() + sv.duration * 60000);
        const client = clients[Math.floor(r() * clients.length)];
        const past = end.getTime() < now;
        const roll = r();
        const status = past ? (roll < 0.04 ? 'no-show' : roll < 0.07 ? 'cancelled' : 'completed') : roll < 0.7 ? 'confirmed' : 'booked';
        const appt: Appointment = {
          id: `${start.toISOString()}_${rid(4)}`,
          clientId: client.id,
          staffId: s.id,
          serviceId: sv.id,
          start: start.toISOString(),
          end: end.toISOString(),
          status,
          price: sv.price,
          source: r() < 0.8 ? 'online' : 'staff',
          notes: '',
          manageToken: rid(12),
          createdAt: new Date(start.getTime() - (2 + Math.floor(r() * 20)) * 86400000).toISOString(),
          newClient: sv.name === 'NEW CLIENT RITUAL',
          // sample bookings count as already confirmed-by-text, so a demo doesn't open with a burst of texts
          texts: { bookedAt: start.toISOString(), confirmRequestAt: start.toISOString() },
        };
        if (status === 'completed') {
          const tip = Math.round(sv.price * pick(r, [0.15, 0.2, 0.2, 0.25]));
          const member = !!client.membership;
          appt.checkout = {
            at: end.toISOString(),
            by: s.id,
            lines: [{ label: sv.name, amount: sv.price }],
            subtotal: member ? 0 : sv.price,
            tip,
            total: (member ? 0 : sv.price) + tip,
            method: 'card',
            status: 'paid',
            creditUsed: 0,
            membershipUsed: member,
            referralDiscount: 0,
          };
          client.lastVisitAt = end.toISOString();
          await store.put('payments', {
            id: `${end.toISOString()}_${rid(4)}`,
            at: end.toISOString(),
            clientId: client.id,
            appointmentId: appt.id,
            kind: 'checkout',
            amount: appt.checkout.subtotal,
            tip,
            method: 'card',
            status: 'paid',
            simulated: true,
            staffId: s.id,
          });
        }
        if (status === 'no-show' || status === 'cancelled') {
          appt.cancel = { at: start.toISOString(), by: status === 'no-show' ? 'staff' : 'client', fee: status === 'no-show' ? sv.price : 0, feeStatus: status === 'no-show' ? 'charged' : 'none', noShow: status === 'no-show' };
        }
        if (status === 'confirmed') appt.texts.confirmedAt = appt.createdAt;
        await store.put('appointments', appt);
        await store.put('tokens', { id: appt.manageToken, appointmentId: appt.id });
        t += sv.duration + pick(r, [0, 0, 0, 15]);
      }
    }
  }
  for (const [a, b] of pairs) {
    const ref = clients[a], friend = clients[b];
    friend.referredBy = ref.id;
    const done = b % 3 !== 0;
    if (done) ref.credit += settings.referrals.referrerGets;
    await store.put('referrals', {
      id: rid(),
      referrerId: ref.id,
      friendId: friend.id,
      code: ref.referralCode,
      status: done ? 'completed' : 'booked',
      createdAt: new Date(now - b * 86400000).toISOString(),
      completedAt: done ? new Date(now - (b - 3) * 86400000).toISOString() : undefined,
      appointmentId: '',
    });
  }
  for (const c of clients) await store.put('clients', c);
}
