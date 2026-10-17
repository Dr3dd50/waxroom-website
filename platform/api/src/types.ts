// Records the platform stores. Money is in cents; times are ISO strings in UTC.

export type Role = 'owner' | 'employee';
export type WeekSchedule = Record<number, { start: number; end: number } | null>; // 0 = Sunday, minutes from midnight

export type Staff = {
  id: string;
  name: string;
  short: string;
  email: string;
  phone?: string;
  role: Role;
  color: string;
  passwordHash?: string;
  active: boolean;
  /** Clients can book this person online. */
  bookable: boolean;
  /** Working hours by weekday; null = day off. Missing = business hours. */
  schedule?: WeekSchedule;
  /** Days or hours off: nothing can be booked online in these windows. */
  timeOff?: TimeOff[];
  /** Texts about bookings and cancellations on their calendar (and, for the owner, everyone's). Missing = on. */
  alerts?: boolean;
};

export type TimeOff = { id: string; from: string; to: string; note: string };

export type Service = {
  id: string;
  name: string;
  category: string;
  order: number;
  price: number;
  priceVaries: boolean;
  duration: number;
  deposit: number | null;
  depositNewClientsOnly: boolean;
  description: string | null;
  staffIds: string[];
  active: boolean;
  bookableOnline: boolean;
  /** Short note texted with the reminder ("let hair grow to ¼ inch…"). */
  prepTip?: string;
  /** Days after a visit before the text inviting the client to book again (when nothing is booked). */
  rebookAfterDays?: number | null;
  /** Send that text for this service. Off until the owner turns it on in Settings. */
  rebookText?: boolean;
  /**
   * A New Client Ritual: this service (its id) plus a complimentary steam, at an
   * introductory price, for a client who hasn't had that service before.
   */
  ritualOf?: string;
};

export type Membership = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  /** Renews every month. */
  includes: { serviceId: string; quantity: number }[];
  active: boolean;
  public: boolean;
  stripePriceId?: string;
};

export type Package = {
  id: string;
  name: string;
  price: number;
  items: { serviceId: string; quantity: number }[];
  expiresMonths: number | null;
  active: boolean;
};

export type Card = { brand: string; last4: string; paymentMethodId: string };

export type Client = {
  id: string;
  first: string;
  last: string;
  phone: string; // E.164
  email: string;
  birthday?: string; // MM-DD
  notes: string;
  createdAt: string;
  smsReminders: boolean;
  smsMarketing: boolean;
  smsMarketingAt?: string;
  /** How and when they agreed to appointment texts: carriers can ask for this. */
  smsConsent?: { at: string; source: 'online' | 'desk' | 'glossgenius' | 'text-reply'; by?: string };
  /** How and when they stopped texts (all of them, or offers only). */
  smsOptOut?: { at: string; source: 'reply' | 'web-form' | 'desk' | 'glossgenius'; scope: 'all' | 'offers'; by?: string };
  /** When the first text from this system reached them (it carried the STOP/HELP line). */
  textedAt?: string;
  customerId?: string; // Stripe customer
  card?: Card;
  credit: number;
  referralCode: string;
  referredBy?: string;
  membership?: { membershipId: string; since: string; status: 'pending' | 'active' | 'past_due' | 'cancelled'; subscriptionId?: string; periodStart: string };
  packages?: { packageId: string; boughtAt: string; expiresAt: string | null; remaining: Record<string, number> }[];
  lastVisitAt?: string;
  rebookNudgedFor?: string;
  /** The last time they were asked to rate a visit, and the visit waiting on their reply. */
  ratingAskedAt?: string;
  ratingPending?: { appointmentId: string; askedAt: string };
  /** Free services given as a thank-you (for rating a visit), used at checkout. */
  perks?: Perk[];
  birthdayTextYear?: number;
  importedFrom?: string;
};

export type Perk = { id: string; serviceId: string; label: string; reason: 'rating'; grantedAt: string; expiresAt: string | null; usedAt?: string; appointmentId?: string };

export type ApptStatus = 'booked' | 'confirmed' | 'checked-in' | 'completed' | 'cancelled' | 'no-show';

export type Appointment = {
  id: string; // `${start}_${rand}` so ids sort by time
  clientId: string;
  staffId: string;
  serviceId: string;
  start: string;
  end: string;
  status: ApptStatus;
  price: number;
  source: 'online' | 'staff' | 'import';
  notes: string;
  manageToken: string;
  createdAt: string;
  newClient: boolean;
  /** pending: the client's bank asked them to approve it; the time is held until they do. */
  deposit?: { amount: number; status: 'pending' | 'paid' | 'failed' | 'applied' | 'refunded'; paymentId?: string };
  referral?: { referrerId: string; code: string; friendDiscount: number };
  texts: { bookedAt?: string; confirmRequestAt?: string; reminderAt?: string; confirmedAt?: string; ratingAskedAt?: string };
  /** The client's 1–5 answer to the text after their visit. */
  rating?: { score: number; at: string };
  /** When it last moved to a new time: the reminder timing counts from here, as from a new booking. */
  movedAt?: string;
  /** Bumped on every change, so a calendar that already has the event replaces it. */
  calendarSeq?: number;
  checkout?: Checkout;
  cancel?: {
    at: string;
    by: 'client' | 'staff';
    fee: number;
    feeStatus: 'none' | 'charged' | 'failed' | 'waived';
    noShow: boolean;
    /** Of a paid deposit: what went back to the card, and what was kept toward the fee. */
    depositRefund?: number;
    depositKept?: number;
  };
};

export type Checkout = {
  at: string;
  by: string;
  lines: { label: string; amount: number }[];
  subtotal: number;
  tip: number;
  total: number;
  method: 'card' | 'cash' | 'other' | 'none';
  paymentId?: string;
  status: 'paid' | 'failed';
  creditUsed: number;
  membershipUsed: boolean;
  packageUsed?: string;
  referralDiscount: number;
};

export type Referral = {
  id: string;
  referrerId: string;
  friendId: string;
  code: string;
  status: 'booked' | 'completed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
  appointmentId: string;
};

export type Message = {
  id: string; // `${at}_${rand}`
  at: string;
  direction: 'out' | 'in';
  to: string;
  from?: string;
  clientId?: string;
  kind: 'booking' | 'moved' | 'confirm-request' | 'reminder' | 'receipt' | 'rebook' | 'referral' | 'birthday' | 'cancel' | 'campaign' | 'reply' | 'inbound' | 'staff' | 'alert' | 'card-link' | 'rating-request' | 'rating-thanks' | 'opt-out';
  body: string;
  status: 'sent' | 'simulated' | 'failed' | 'received' | 'queued';
  /** Texts unless marked email (then `to` is the address and `subject` is set). */
  channel?: 'sms' | 'email';
  subject?: string;
  /** Queued: held until this time (a staff text that came in during quiet hours). */
  sendAfter?: string;
  providerId?: string;
  error?: string;
};

export type Payment = {
  id: string; // `${at}_${rand}`
  at: string;
  clientId: string;
  appointmentId?: string;
  kind: 'deposit' | 'checkout' | 'cancel-fee' | 'no-show-fee' | 'membership' | 'package' | 'refund';
  amount: number;
  tip: number;
  method: 'card' | 'cash' | 'other';
  status: 'paid' | 'failed';
  providerId?: string;
  simulated: boolean;
  staffId?: string;
  error?: string;
};

export type Settings = {
  id: 'settings';
  timezone: string;
  hours: Record<string, { start: number; end: number; working: boolean }>; // monday… in hours
  policies: {
    cancellationPolicy: string;
    cancellationWindowHours: number;
    cancellationFeePercent: number;
    /** A paid deposit is refunded when the client cancels at least this many hours ahead. Missing = the late-cancel window. */
    depositRefundHours?: number;
    noShowFeePercent: number;
    allowOnlineCancellations: boolean;
    cardRequired: boolean;
    futureBookingsLimit: number | null;
    defaultTipPercent: number;
    leadTimeMinutes: number;
    bookAheadDays: number;
    slotStepMinutes: number;
  };
  notifications: { confirmHoursBefore: number; reminderHoursBefore: number; rebookAfterDays: number; quietStart: number; quietEnd: number };
  automations: Record<string, { enabled: boolean; text: string }>;
  referrals: { enabled: boolean; friendGets: number; referrerGets: number };
  /**
   * The switch from GlossGenius. Until it's done, GlossGenius is the only booking
   * system: nothing here books, texts or charges. Done only after a final import,
   * with GlossGenius online booking turned off.
   */
  switchover: { done: boolean; at?: string; by?: string; remindImported?: boolean };
  /** Before the switchover field existed. Read once by the upgrade, then removed. */
  onlineBooking?: { open: boolean };
  /** The last GlossGenius import (clients and appointments). */
  glossGeniusImport?: ImportReport & { by: string };
  /**
   * After a visit: a text asking the client to rate it 1–5. Anyone who answers can be
   * thanked with a free service (once per client, whatever the score), and every
   * answer gets the Google review link: the thank-you is for answering, never for a review.
   */
  reviews?: {
    enabled: boolean;
    /** Hours after checkout. */
    delayHours: number;
    /** At most one rating text per client in this many days. */
    everyDays: number;
    /** Where a review is written (the Google Business Profile's review link). */
    reviewUrl: string;
    /** The thank-you: a free visit of this service, once per client. null = none. */
    rewardServiceId: string | null;
    /** What clients are told they get ("V-Steam"); blank = the service's name. */
    rewardLabel?: string;
    rewardDays: number | null;
  };
  /**
   * The appointment messages (booking, moved, confirm, reminder, cancelled, receipt)
   * also go by email to clients with an address. Online booking asks for an email while on.
   */
  emails?: { enabled: boolean };
  /** Texts to staff when appointments are booked, moved or cancelled. */
  staffAlerts: { enabled: boolean };
  /** Employees see clients' phone numbers and emails only when the owner allows it. */
  privacy: { employeesSeeContact: boolean };
  /** One-time changes to data already in the store (see seed.ts upgrade), by name, once each. */
  applied?: string[];
};

export type ImportReport = {
  at: string;
  clients?: { added: number; matched: number; skipped: number };
  appointments?: { added: number; updated: number; unchanged: number; unmatched: number; removed?: number; problems: string[] };
};

export type Collection = 'staff' | 'services' | 'memberships' | 'packages' | 'clients' | 'appointments' | 'referrals' | 'messages' | 'payments' | 'settings' | 'tokens' | 'metaOutbox' | 'outbox' | 'locks';
