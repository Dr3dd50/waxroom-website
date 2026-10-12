// The New Client Rituals (src/data/rituals.json, from the content repo's offer bank):
// a service plus a complimentary steam, at an introductory price, for a client new
// to that service.
//
// Only rituals that can be booked right now are shown. Until the switch from
// GlossGenius, that's the ones GlossGenius has (the Brazilian one); once our own
// booking is open, all of them.
import { useEffect, useState } from 'react';
import ritualData from '../data/rituals.json';
import { api } from './api';
import { NATIVE, onGlossGenius } from './booking';

export type Ritual = (typeof ritualData.rituals)[number];

/** The rituals for these booking categories (all of them when none are given) that can be booked now. */
export function useRituals(categories?: string[]) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!NATIVE) return;
    api<{ booking: 'open' | 'closed' }>('/public/config').then((c) => setOpen(c.booking === 'open'), () => {});
  }, []);
  return ritualData.rituals.filter((r) => (!categories || categories.includes(r.category)) && (open || onGlossGenius(r.name)));
}
