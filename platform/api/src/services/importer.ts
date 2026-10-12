// A GlossGenius export, brought into our system. The owner uploads it in the
// dashboard (Settings → Online booking), or it runs from the command line
// (platform/api/scripts/import-glossgenius.ts).
//
// Clients: GlossGenius → Clients → Export Clients gives name, email, phone,
// birthday and banned status (notes aren't included; GlossGenius support can
// send those). Appointments: from Insights or GlossGenius support; columns are
// matched by name, so small differences in the export's headers are fine.
// Banned clients are skipped.
//
// Run it as often as needed while both systems are live: clients match on phone
// and appointments on client + time, so nothing is duplicated, and a later export
// updates what changed (a GlossGenius appointment since cancelled, or completed).
// Imported appointments block those times on our calendar but get no texts from
// us, since GlossGenius sends its own.
import type { Store } from '../store/store';
import type { Appointment, Client, ImportReport, Service, Settings, Staff } from '../types';
import { uniqueReferralCode } from './clients';
import { isFree } from './availability';
import { zonedToUtc } from '../lib/time';
import { nowIso, rid, toE164 } from '../lib/util';

/** Minimal CSV parser: quoted fields, commas and newlines inside quotes. */
export function parseCsv(text: string) {
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
  if (!head) return [];
  const keys = head.map((h) => h.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
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

export async function importGlossGenius(store: Store, files: { clients?: string; appointments?: string }, opts: { dryRun?: boolean; now?: Date } = {}): Promise<ImportReport> {
  const dry = !!opts.dryRun;
  const now = opts.now ?? new Date();
  const report: ImportReport = { at: nowIso() };
  const clients = await store.list<Client>('clients');
  const byPhone = new Map(clients.map((c) => [c.phone, c]));

  if (files.clients) {
    let added = 0, matched = 0, skipped = 0;
    for (const row of parseCsv(files.clients)) {
      if (/^(true|yes|1)$/i.test(col(row, 'banned'))) {
        skipped++;
        continue;
      }
      const phone = toE164(col(row, 'phone', 'mobile', 'cell'));
      let first = col(row, 'first name', 'first');
      let last = col(row, 'last name', 'last');
      if (!first) [first, last] = col(row, 'name', 'client').split(/\s+(.+)/);
      if (!phone || !first) {
        skipped++;
        continue;
      }
      const existing = byPhone.get(phone);
      if (existing) {
        existing.email ||= col(row, 'email');
        existing.birthday ||= monthDay(col(row, 'birthday', 'date of birth', 'dob'));
        if (!dry) await store.put('clients', existing);
        matched++;
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
        referralCode: dry ? '' : await uniqueReferralCode(store, first),
        importedFrom: 'glossgenius',
      };
      byPhone.set(phone, c);
      clients.push(c);
      if (!dry) await store.put('clients', c);
      added++;
    }
    report.clients = { added, matched, skipped };
  }

  if (files.appointments) {
    const services = await store.list<Service>('services');
    const staff = await store.list<Staff>('staff');
    const settings = (await store.get<Settings>('settings', 'settings'))!;
    const existing = new Map((await store.list<Appointment>('appointments')).map((a) => [`${a.clientId}|${a.start}`, a]));
    let added = 0, updated = 0, unchanged = 0, unmatched = 0;
    const problems: string[] = [];
    const touched = new Map<string, Client>();
    for (const row of parseCsv(files.appointments)) {
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
        problems.push(`${col(row, 'client', 'name') || phone || '?'} · ${col(row, 'service') || '?'} · ${dateStr} ${timeStr}`.trim());
        continue;
      }
      // the export's date and time are studio wall-clock times
      const day = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const start = zonedToUtc(day, dt.getHours() * 60 + dt.getMinutes(), settings.timezone).toISOString();
      const end = new Date(Date.parse(start) + service.duration * 60000).toISOString();
      const raw = col(row, 'status');
      const status: Appointment['status'] = /cancel/i.test(raw) ? 'cancelled' : /no.?show/i.test(raw) ? 'no-show' : Date.parse(start) < now.getTime() ? 'completed' : 'booked';
      if (status === 'completed' && (!client.lastVisitAt || client.lastVisitAt < end)) {
        client.lastVisitAt = end;
        touched.set(client.id, client);
      }
      const had = existing.get(`${client.id}|${start}`);
      if (had) {
        // only our copies of GlossGenius bookings follow the export; ours stay ours
        if (had.source === 'import' && had.status !== status) {
          had.status = status;
          had.calendarSeq = (had.calendarSeq ?? 0) + 1;
          if (!dry) await store.put('appointments', had);
          updated++;
        } else unchanged++;
        continue;
      }
      const staffId = service.staffIds.includes(person.id) ? person.id : (service.staffIds[0] ?? person.id);
      // never two bookings in one time: a clash is listed for the owner instead
      if (status === 'booked' && !(await isFree(store, staffId, start, service.duration))) {
        unmatched++;
        problems.push(`Clashes with a booking already on the calendar: ${col(row, 'client', 'name') || phone} · ${col(row, 'service')} · ${dateStr} ${timeStr}`.trim());
        continue;
      }
      const appt: Appointment = {
        id: `${start}_${rid(4)}`,
        clientId: client.id,
        staffId,
        serviceId: service.id,
        start,
        end,
        status,
        price: Math.round(Number(col(row, 'price', 'amount').replace(/[^0-9.]/g, '') || service.price / 100) * 100),
        source: 'import',
        notes: col(row, 'notes', 'note'),
        manageToken: rid(12),
        createdAt: nowIso(),
        newClient: false,
        texts: {},
      };
      existing.set(`${client.id}|${start}`, appt);
      if (!dry) {
        await store.put('appointments', appt);
        await store.put('tokens', { id: appt.manageToken, appointmentId: appt.id });
      }
      added++;
    }
    if (!dry) for (const c of touched.values()) await store.put('clients', c);
    report.appointments = { added, updated, unchanged, unmatched, problems: problems.slice(0, 100) };
  }
  return report;
}
