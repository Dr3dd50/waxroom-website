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
  /** Days after a visit to text a rebooking nudge, if nothing is booked. null = no nudge. */
  rebookAfterDays?: number | null;
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
  customerId?: string; // Stripe customer
  card?: Card;
  credit: number;
  referralCode: string;
  referredBy?: string;
  membership?: { membershipId: string; since: string; status: 'pending' | 'active' | 'past_due' | 'cancelled'; subscriptionId?: string; periodStart: string };
  packages?: { packageId: string; boughtAt: string; expiresAt: string | null; remaining: Record<string, number> }[];
  lastVisitAt?: string;
  rebookNudgedFor?: string;
  birthdayTextYear?: number;
  importedFrom?: string;
};

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
  texts: { bookedAt?: string; confirmRequestAt?: string; reminderAt?: string; confirmedAt?: string };
  /** Bumped on every change, so a calendar that already has the event replaces it. */
  calendarSeq?: number;
  checkout?: Checkout;
  cancel?: { at: string; by: 'client' | 'staff'; fee: number; feeStatus: 'none' | 'charged' | 'failed' | 'waived'; noShow: boolean };
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
  kind: 'booking' | 'moved' | 'confirm-request' | 'reminder' | 'receipt' | 'rebook' | 'referral' | 'birthday' | 'cancel' | 'campaign' | 'reply' | 'inbound' | 'staff' | 'alert';
  body: string;
  status: 'sent' | 'simulated' | 'failed' | 'received' | 'queued';
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
  kind: 'deposit' | 'checkout' | 'cancel-fee' | 'no-show-fee' | 'membership' | 'package';
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
  /** Texts to staff when appointments are booked, moved or cancelled. */
  staffAlerts: { enabled: boolean };
  /** Employees see clients' phone numbers and emails only when the owner allows it. */
  privacy: { employeesSeeContact: boolean };
};

export type ImportReport = {
  at: string;
  clients?: { added: number; matched: number; skipped: number };
  appointments?: { added: number; updated: number; unchanged: number; unmatched: number; removed?: number; problems: string[] };
};

export type Collection = 'staff' | 'services' | 'memberships' | 'packages' | 'clients' | 'appointments' | 'referrals' | 'messages' | 'payments' | 'settings' | 'tokens' | 'metaOutbox' | 'outbox' | 'locks';
