// Shapes the API returns (mirrors platform/api/src/types.ts).
export type TimeOff = { id: string; from: string; to: string; note: string };
export type Staff = { id: string; name: string; short: string; email: string; phone?: string; role: 'owner' | 'employee'; color: string; active: boolean; bookable: boolean; schedule?: Record<number, { start: number; end: number } | null>; timeOff: TimeOff[]; alerts: boolean };
export type Service = { id: string; name: string; category: string; order: number; price: number; priceVaries: boolean; duration: number; deposit: number | null; depositNewClientsOnly: boolean; description: string | null; staffIds: string[]; active: boolean; bookableOnline: boolean; prepTip?: string; rebookAfterDays?: number | null; rebookText?: boolean; ritualOf?: string };
export type Membership = { id: string; name: string; description: string | null; price: number; includes: { serviceId: string; quantity: number }[]; active: boolean; public: boolean };
export type Package = { id: string; name: string; price: number; items: { serviceId: string; quantity: number }[]; expiresMonths: number | null; active: boolean };
export type Status = 'booked' | 'confirmed' | 'checked-in' | 'completed' | 'cancelled' | 'no-show';
export type Appointment = {
  id: string;
  clientId: string;
  staffId: string;
  serviceId: string;
  start: string;
  end: string;
  status: Status;
  price: number;
  source: 'online' | 'staff' | 'import';
  notes: string;
  newClient: boolean;
  deposit?: { amount: number; status: string };
  calendarSeq?: number;
  referral?: { referrerId: string; code: string; friendDiscount: number };
  texts: { bookedAt?: string; confirmRequestAt?: string; reminderAt?: string; confirmedAt?: string };
  movedAt?: string;
  rating?: { score: number; at: string };
  checkout?: { at: string; lines: { label: string; amount: number }[]; subtotal: number; tip: number; total: number; method: string; membershipUsed: boolean; packageUsed?: string; creditUsed: number; referralDiscount: number };
  cancel?: { at: string; by: string; fee: number; feeStatus: string; noShow: boolean; depositRefund?: number; depositKept?: number };
};
export type Client = {
  id: string;
  first: string;
  last: string;
  phone: string;
  email: string;
  /** The owner hasn't allowed employees to see phone numbers and emails. */
  contactHidden?: boolean;
  notes: string;
  credit: number;
  card: string | null;
  membership?: { membershipId: string; since: string; status: string; periodStart: string };
  smsReminders: boolean;
  smsMarketing: boolean;
  referralCode: string;
  referredBy?: string;
  createdAt: string;
  lastVisitAt?: string;
  birthday?: string;
  /** Thank-you visits still to use (for rating a visit). */
  perks?: { id: string; serviceId: string; label: string; expiresAt: string | null }[];
};
export type Settings = {
  timezone: string;
  hours: Record<string, { start: number; end: number; working: boolean }>;
  policies: { cancellationPolicy: string; cancellationWindowHours: number; cancellationFeePercent: number; depositRefundHours?: number; noShowFeePercent: number; allowOnlineCancellations: boolean; cardRequired: boolean; futureBookingsLimit: number | null; defaultTipPercent: number; leadTimeMinutes: number; bookAheadDays: number; slotStepMinutes: number };
  notifications: { confirmHoursBefore: number; reminderHoursBefore: number; rebookAfterDays: number; quietStart: number; quietEnd: number };
  automations: Record<string, { enabled: boolean; text: string }>;
  referrals: { enabled: boolean; friendGets: number; referrerGets: number };
  switchover: { done: boolean; at?: string; by?: string; remindImported?: boolean };
  glossGeniusImport?: ImportReport & { by: string };
  staffAlerts: { enabled: boolean };
  privacy: { employeesSeeContact: boolean };
  emails?: { enabled: boolean };
  reviews?: { enabled: boolean; delayHours: number; everyDays: number; reviewUrl: string; rewardServiceId: string | null; rewardLabel?: string; rewardDays: number | null };
};
export type ImportReport = {
  at: string;
  clients?: { added: number; matched: number; skipped: number };
  appointments?: { added: number; updated: number; unchanged: number; unmatched: number; removed?: number; problems: string[] };
};
export type Boot = { me: Staff; staff: Staff[]; services: Service[]; memberships: Membership[]; packages: Package[]; settings: Settings; live: { payments: boolean; texts: boolean; email?: boolean }; today: string };
