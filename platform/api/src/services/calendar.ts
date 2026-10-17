// The client's calendar invite: one event per booking, with a fixed id (UID) and a
// sequence number that goes up on every change. Opening the link from a later text
// (moved, cancelled) updates the event already in Apple Calendar or Outlook rather
// than adding a second one; Google Calendar adds it fresh, so the texts carry the
// new link every time the booking changes.
import { config } from '../config';
import type { Appointment, Service } from '../types';
import { nice } from '../lib/util';
import catalog from '../../../seed/catalog.json';

/** The API answers on the staff domain; www has no /api. */
export const calendarLink = (a: Appointment) => `${config.staffUrl}/api/cal/${a.manageToken}`;

const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
// RFC 5545: escape text, fold lines at 75 octets
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let n = 75;
    while (Buffer.byteLength(rest.slice(0, n)) > 75) n--;
    out.push(rest.slice(0, n));
    rest = ` ${rest.slice(n)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

export function icsFor(a: Appointment, service: Service, staffShort: string, manageLink: string) {
  const cancelled = a.status === 'cancelled' || a.status === 'no-show';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Wax Room//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${a.manageToken}@waxroomrichmond.com`,
    `SEQUENCE:${a.calendarSeq ?? 0}`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(a.start)}`,
    `DTEND:${stamp(a.end)}`,
    `SUMMARY:${esc(`${cancelled ? 'Cancelled: ' : ''}${nice(service.name)} at The Wax Room`)}`,
    `LOCATION:${esc(`The Wax Room, ${catalog.business.address}`)}`,
    `DESCRIPTION:${esc(`${cancelled ? 'This appointment is cancelled.' : `With ${staffShort}.${service.prepTip ? ` ${service.prepTip}` : ''}`} Change or cancel: ${manageLink}`)}`,
    `URL:${manageLink}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    ...(cancelled
      ? []
      : ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Your Wax Room appointment', 'TRIGGER:-PT2H', 'END:VALARM']),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** A Google Calendar "add event" link, for the booking page (Google doesn't open .ics links from a text). */
export function googleCalendarUrl(a: Appointment, service: Service, manageLink: string) {
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${nice(service.name)} at The Wax Room`,
    dates: `${stamp(a.start)}/${stamp(a.end)}`,
    location: `The Wax Room, ${catalog.business.address}`,
    details: `Change or cancel: ${manageLink}`,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}
