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
import { zoned, zonedToUtc } from '../lib/time';
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
// Columns that hold a date or time but not the appointment's own ("Created Date").
const NOT_WHEN = /created|updated|modified|booked on|birth|paid|cancell?ed (at|on|date)/;
/**
 * A column's value by header: an exact header first (in the order given), then a
 * header containing the name. Date and time lookups skip bookkeeping columns.
 */
/**
 * Whether the export says this client doesn't take texts. GlossGenius's column names
 * vary by export, so any column about SMS or text messages is read: a yes in an
 * opt-out column, or a no in an opt-in or notifications one.
 */
export function textsOff(row: Record<string, string>) {
  for (const [k, v] of Object.entries(row)) {
    if (!/\b(sms|texts?|text messages?)\b/.test(k) || !v?.trim()) continue;
    if (/marketing|promo/.test(k)) continue; // offers start off anyway
    const yes = /^(true|yes|y|1|on|subscribed|opted in)$/i.test(v.trim());
    const no = /^(false|no|n|0|off|unsubscribed|opted out|stop)$/i.test(v.trim());
    if (/opt.?out|unsubscrib|blocked/.test(k) ? yes : no) return true;
  }
  return false;
}

const col = (row: Record<string, string>, ...names: string[]) => {
  const keys = Object.keys(row);
  for (const n of names) if (row[n]) return row[n];
  for (const n of names)
    for (const k of keys) if (k.includes(n) && row[k] && !(/date|time|start|end/.test(n) && NOT_WHEN.test(k))) return row[k];
  return '';
};
/** "60", "60 min", "1h 30m", "1:30" → minutes */
function minutesOf(s: string) {
  if (!s) return 0;
  const hm = /^(\d+):(\d{2})$/.exec(s.trim());
  if (hm) return +hm[1] * 60 + +hm[2];
  const h = /(\d+(?:\.\d+)?)\s*h/i.exec(s), m = /(\d+)\s*m/i.exec(s);
  if (h || m) return Math.round((h ? +h[1] * 60 : 0) + (m ? +m[1] : 0));
  return /^\d+$/.test(s.trim()) ? +s.trim() : 0;
}
/** Write many records, a batch at a time (a real export has thousands of rows). */
async function putAll(store: Store, col: 'clients' | 'appointments' | 'tokens', items: { id: string }[]) {
  for (let i = 0; i < items.length; i += 25) await Promise.all(items.slice(i, i + 25).map((x) => store.put(col, x)));
}

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
  const codes = new Set(clients.map((c) => c.referralCode));
  const referralCode = (first: string) => {
    const base = first.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10) || 'FRIEND';
    for (let n = 10; ; n++) if (!codes.has(`${base}${n}`)) return (codes.add(`${base}${n}`), `${base}${n}`);
  };
  const changed = new Map<string, Client>();

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
        // an opt-out made in GlossGenius since the last import still counts
        if (textsOff(row) && existing.smsReminders) {
          existing.smsReminders = false;
          existing.smsMarketing = false;
          existing.smsOptOut = { at: nowIso(), source: 'glossgenius', scope: 'all' };
        }
        changed.set(existing.id, existing);
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
        // appointment texts continue as before, unless GlossGenius has them opted out;
        // marketing needs fresh opt-in
        ...(textsOff(row)
          ? { smsReminders: false, smsOptOut: { at: nowIso(), source: 'glossgenius' as const, scope: 'all' as const } }
          : { smsReminders: true, smsConsent: { at: nowIso(), source: 'glossgenius' as const } }),
        smsMarketing: false,
        credit: 0,
        referralCode: referralCode(first),
        importedFrom: 'glossgenius',
      };
      byPhone.set(phone, c);
      clients.push(c);
      changed.set(c.id, c);
      added++;
    }
    if (!dry) await putAll(store, 'clients', [...changed.values()]);
    changed.clear();
    report.clients = { added, matched, skipped };
  }

  if (files.appointments) {
    const services = await store.list<Service>('services');
    const staff = await store.list<Staff>('staff');
    const settings = (await store.get<Settings>('settings', 'settings'))!;
    const all = await store.list<Appointment>('appointments');
    const existing = new Map(all.map((a) => [`${a.clientId}|${a.start}`, a]));
    // who is busy when, kept up to date as rows come in, so nothing lands on a taken time
    const busy = (a: Appointment) => a.status !== 'cancelled' && a.status !== 'no-show';
    const taken = all.filter(busy);
    const clash = (staffId: string, start: string, end: string, ignore?: string) =>
      taken.some((a) => a.id !== ignore && a.staffId === staffId && a.start < end && a.end > start);
    let added = 0, updated = 0, unchanged = 0, unmatched = 0, removed = 0;
    const problems: string[] = [];
    const writes: Appointment[] = [];
    const tokens: { id: string; appointmentId: string }[] = [];
    const seen = new Set<string>();
    let firstDay = '9999', lastDay = '0000';
    for (const row of parseCsv(files.appointments)) {
      const phone = toE164(col(row, 'phone', 'client phone', 'mobile'));
      const name = col(row, 'client', 'client name', 'name');
      const client = phone ? byPhone.get(phone) : clients.find((c) => `${c.first} ${c.last}`.toLowerCase() === name.toLowerCase());
      const sName = col(row, 'service', 'service name').toLowerCase();
      const service = services.find((s) => s.name.toLowerCase() === sName) ?? services.find((s) => sName.includes(s.name.toLowerCase()));
      const dateStr = col(row, 'date', 'appointment date', 'start date', 'start');
      const timeStr = col(row, 'time', 'start time', 'appointment time');
      const dt = new Date(`${dateStr} ${/\d:\d/.test(dateStr) ? '' : timeStr}`.trim());
      const label = `${name || phone || '?'} · ${col(row, 'service') || '?'} · ${dateStr} ${timeStr}`.trim();
      if (!client || !service || isNaN(+dt)) {
        unmatched++;
        problems.push(`${!client ? 'Client not found' : !service ? 'Service not found' : 'Date or time not readable'}: ${label}`);
        continue;
      }
      // the person: as named in the export; with no name, the only one who offers it
      const who = col(row, 'staff', 'team member', 'provider', 'employee').toLowerCase();
      const person = who
        ? staff.find((s) => s.name.toLowerCase() === who || s.short.toLowerCase() === who || s.short.toLowerCase() === who.split(' ')[0])
        : service.staffIds.length === 1
          ? staff.find((s) => s.id === service.staffIds[0])
          : undefined;
      if (!person) {
        unmatched++;
        problems.push(`${who ? `Team member “${who}” not found` : 'No team member given'}: ${label}`);
        continue;
      }
      // the export's date and time are studio wall-clock times
      const day = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      if (day < firstDay) firstDay = day;
      if (day > lastDay) lastDay = day;
      const start = zonedToUtc(day, dt.getHours() * 60 + dt.getMinutes(), settings.timezone).toISOString();
      // GlossGenius's own length when the export has it (add-ons make some longer)
      const endStr = col(row, 'end time', 'end');
      const endDt = endStr ? new Date(/\d{4}|\//.test(endStr) ? endStr : `${dateStr} ${endStr}`) : null;
      const length = minutesOf(col(row, 'duration', 'length')) || (endDt && !isNaN(+endDt) ? Math.round((+endDt - +dt) / 60000) : 0) || service.duration;
      const end = new Date(Date.parse(start) + length * 60000).toISOString();
      const raw = col(row, 'status');
      const status: Appointment['status'] = /cancel/i.test(raw) ? 'cancelled' : /no.?show/i.test(raw) ? 'no-show' : Date.parse(start) < now.getTime() ? 'completed' : 'booked';
      if (status === 'completed' && (!client.lastVisitAt || client.lastVisitAt < end)) {
        client.lastVisitAt = end;
        changed.set(client.id, client);
      }
      const key = `${client.id}|${start}`;
      seen.add(key);
      const had = existing.get(key);
      if (had) {
        // only our copies of GlossGenius bookings follow the export; ours stay ours
        if (had.source === 'import' && (had.status !== status || had.staffId !== person.id || had.end !== end)) {
          if (busy({ ...had, status }) && clash(person.id, start, end, had.id)) {
            unmatched++;
            problems.push(`Clashes with a booking already on the calendar: ${label}`);
            continue;
          }
          const next = { ...had, status, staffId: person.id, end, calendarSeq: (had.calendarSeq ?? 0) + 1 };
          const i = taken.findIndex((a) => a.id === had.id);
          if (i !== -1) taken.splice(i, 1);
          if (busy(next)) taken.push(next);
          existing.set(key, next);
          writes.push(next);
          updated++;
        } else unchanged++;
        continue;
      }
      if (status === 'booked' && clash(person.id, start, end)) {
        unmatched++;
        problems.push(`Clashes with a booking already on the calendar: ${label}`);
        continue;
      }
      const appt: Appointment = {
        id: `${start}_${rid(4)}`,
        clientId: client.id,
        staffId: person.id,
        serviceId: service.id,
        start,
        end,
        status,
        price: Math.round(Number(col(row, 'price', 'amount', 'total').replace(/[^0-9.]/g, '') || service.price / 100) * 100),
        source: 'import',
        notes: col(row, 'notes', 'note'),
        manageToken: rid(12),
        createdAt: nowIso(),
        newClient: false,
        texts: {},
      };
      existing.set(key, appt);
      if (busy(appt)) taken.push(appt);
      writes.push(appt);
      tokens.push({ id: appt.manageToken, appointmentId: appt.id });
      added++;
    }
    // A GlossGenius booking that was moved or deleted there is missing from this
    // export: our copy is cancelled, so its old time doesn't stay blocked. Only
    // upcoming ones, and only inside the dates this export covers.
    const today = now.toISOString();
    for (const a of existing.values()) {
      if (a.source !== 'import' || a.status !== 'booked' || a.start < today || seen.has(`${a.clientId}|${a.start}`)) continue;
      const day = zoned(a.start, settings.timezone).day;
      if (day < firstDay || day > lastDay) continue;
      writes.push({ ...a, status: 'cancelled', calendarSeq: (a.calendarSeq ?? 0) + 1, notes: `${a.notes ? `${a.notes} · ` : ''}No longer in GlossGenius (import ${today.slice(0, 10)})` });
      removed++;
    }
    if (!dry) {
      await putAll(store, 'appointments', writes);
      await putAll(store, 'tokens', tokens);
      await putAll(store, 'clients', [...changed.values()]);
    }
    report.appointments = { added, updated, unchanged, unmatched, removed, problems: problems.slice(0, 200) };
  }
  return report;
}
