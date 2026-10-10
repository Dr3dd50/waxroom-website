// Import a GlossGenius export into our system.
//
//   npx tsx platform/api/scripts/import-glossgenius.ts --clients clients.csv [--appointments appointments.csv] [--dry-run]
//
// Clients: GlossGenius → Clients → Export Clients gives name, email, phone,
// birthday and banned status (notes aren't included; GlossGenius support can
// send those). Appointments: from Insights or GlossGenius support; columns are
// matched by name, so small differences in the export's headers are fine.
// Banned clients are skipped. Running it twice won't duplicate anyone: clients
// match on phone, appointments on client + time.
import { readFileSync } from 'node:fs';
import { makeStore } from '../src/app';
import type { Appointment, Client, Service, Settings, Staff } from '../src/types';
import { uniqueReferralCode } from '../src/services/clients';
import { zonedToUtc } from '../src/lib/time';
import { nowIso, rid, toE164 } from '../src/lib/util';

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(k);
  return i === -1 ? undefined : args[i + 1];
};
const dry = args.includes('--dry-run');

/** Minimal CSV parser: quoted fields, commas and newlines inside quotes. */
function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  const keys = head.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}
const col = (row: Record<string, string>, ...names: string[]) => {
  for (const n of names) for (const k of Object.keys(row)) if (k === n || k.includes(n)) if (row[k]) return row[k];
  return '';
};

/** "3/4/1990", "1990-03-04", "March 4" → "03-04" */
function monthDay(s: string) {
  if (!s) return undefined;
  const d = new Date(/\d{4}/.test(s) ? s : `${s} 2000`);
  return isNaN(+d) ? undefined : `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const store = await makeStore();
const clients = await store.list<Client>('clients');
const byPhone = new Map(clients.map((c) => [c.phone, c]));
let added = 0, updated = 0, skipped = 0;

const clientsFile = arg('--clients');
if (clientsFile) {
  for (const row of parseCsv(readFileSync(clientsFile, 'utf8'))) {
    if (/^(true|yes|1)$/i.test(col(row, 'banned'))) {
      skipped++;
      continue;
    }
    const phone = toE164(col(row, 'phone', 'mobile', 'cell'));
    let first = col(row, 'first name', 'first');
    let last = col(row, 'last name', 'last');
    if (!first) [first, ...[last]] = col(row, 'name', 'client').split(/\s+(.+)/);
    if (!phone || !first) {
      skipped++;
      continue;
    }
    const existing = byPhone.get(phone);
    if (existing) {
      existing.email ||= col(row, 'email');
      existing.birthday ||= monthDay(col(row, 'birthday', 'date of birth', 'dob'));
      if (!dry) await store.put('clients', existing);
      updated++;
      continue;
    }
    const c: Client = {
      id: rid(),
      first,
      last: last ?? '',
      phone,
      email: col(row, 'email'),
      birthday: monthDay(col(row, 'birthday', 'date of birth', 'dob')),
      notes: col(row, 'notes', 'note'),
      createdAt: nowIso(),
      // appointment texts continue as before; marketing needs fresh opt-in
      smsReminders: true,
      smsMarketing: false,
      credit: 0,
      referralCode: await uniqueReferralCode(store, first),
      importedFrom: 'glossgenius',
    };
    byPhone.set(phone, c);
    if (!dry) await store.put('clients', c);
    added++;
  }
  console.log(`Clients: ${added} added, ${updated} matched, ${skipped} skipped (banned or no phone/name).`);
}

const apptFile = arg('--appointments');
if (apptFile) {
  const services = await store.list<Service>('services');
  const staff = await store.list<Staff>('staff');
  const settings = (await store.get<Settings>('settings', 'settings'))!;
  const existing = new Set((await store.list<Appointment>('appointments')).map((a) => `${a.clientId}|${a.start}`));
  let made = 0, unmatched = 0;
  const problems: string[] = [];
  for (const row of parseCsv(readFileSync(apptFile, 'utf8'))) {
    const phone = toE164(col(row, 'phone', 'client phone'));
    const client = phone ? byPhone.get(phone) : clients.find((c) => `${c.first} ${c.last}`.toLowerCase() === col(row, 'client', 'name').toLowerCase());
    const sName = col(row, 'service').toLowerCase();
    const service = services.find((s) => s.name.toLowerCase() === sName) ?? services.find((s) => sName.includes(s.name.toLowerCase()));
    const who = col(row, 'staff', 'team member', 'provider').toLowerCase();
    const person = staff.find((s) => s.name.toLowerCase() === who || s.short.toLowerCase() === who.split(' ')[0]) ?? staff.find((s) => s.role === 'owner')!;
    const dateStr = col(row, 'date', 'start');
    const timeStr = col(row, 'time', 'start time');
    const dt = new Date(`${dateStr} ${/\d:\d/.test(dateStr) ? '' : timeStr}`.trim());
    if (!client || !service || isNaN(+dt)) {
      unmatched++;
      problems.push(`${col(row, 'client', 'name')} · ${col(row, 'service')} · ${dateStr} ${timeStr}`);
      continue;
    }
    // the export's date and time are studio wall-clock times
    const day = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const start = zonedToUtc(day, dt.getHours() * 60 + dt.getMinutes(), settings.timezone).toISOString();
    if (existing.has(`${client.id}|${start}`)) continue;
    const status = /cancel/i.test(col(row, 'status')) ? 'cancelled' : /no.?show/i.test(col(row, 'status')) ? 'no-show' : Date.parse(start) < Date.now() ? 'completed' : 'booked';
    const appt: Appointment = {
      id: `${start}_${rid(4)}`,
      clientId: client.id,
      staffId: service.staffIds.includes(person.id) ? person.id : service.staffIds[0] ?? person.id,
      serviceId: service.id,
      start,
      end: new Date(Date.parse(start) + service.duration * 60000).toISOString(),
      status,
      price: Math.round(Number(col(row, 'price', 'amount').replace(/[^0-9.]/g, '') || service.price / 100) * 100),
      source: 'import',
      notes: col(row, 'notes', 'note'),
      manageToken: rid(12),
      createdAt: nowIso(),
      newClient: false,
      // already confirmed and reminded by GlossGenius up to now; ours take over from here
      texts: { bookedAt: nowIso() },
    };
    if (status === 'completed' && (!client.lastVisitAt || client.lastVisitAt < appt.end)) client.lastVisitAt = appt.end;
    if (!dry) {
      await store.put('appointments', appt);
      await store.put('tokens', { id: appt.manageToken, appointmentId: appt.id });
      await store.put('clients', client);
    }
    made++;
  }
  console.log(`Appointments: ${made} imported, ${unmatched} couldn't be matched.`);
  if (problems.length) console.log('Check these by hand:\n  ' + problems.slice(0, 50).join('\n  '));
}
if (dry) console.log('(dry run: nothing saved)');
