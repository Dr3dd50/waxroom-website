// What every screen needs: who's signed in, the team, the menu and settings,
// plus formatting in the studio's own timezone (whatever the device is set to).
import { createContext, useContext } from 'react';
import type { Boot } from './types';

export const BootCtx = createContext<(Boot & { reload: () => Promise<void> }) | null>(null);
export const useBoot = () => useContext(BootCtx)!;

export const TZ = 'America/New_York';
export const money = (cents: number | null | undefined) => (cents == null ? '—' : `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`);
export const nice = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : s);
export const duration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
export const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
export const dateLong = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
export const dateShort = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
export const phone = (e164: string) => {
  const d = e164.replace(/\D/g, '').slice(-10);
  if (!d) return ''; // hidden from employees unless the owner allows it
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};

/** Minutes after studio-midnight, and the studio's calendar day, for an instant. */
export function local(iso: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute };
}
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
export const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

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
export const CATEGORY_ORDER = Object.keys(CATEGORY_COLORS);
