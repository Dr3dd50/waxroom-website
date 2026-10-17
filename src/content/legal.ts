// The Privacy Policy (/privacy/) and Terms of Service (/terms/). Written to match what
// the site and booking system actually do; [label](/path) in a line becomes a link.
// The texting terms (#texts) are what the booking form's consent line points to.
import { business, phoneDisplay } from '../data';

export type LegalSection = { id: string; title: string; body: (string | string[])[] };
export type LegalDoc = { key: 'privacy' | 'terms'; path: string; title: string; seoTitle: string; description: string; updated: string; intro: string; sections: LegalSection[] };

const UPDATED = 'October 17, 2026';
const contact = `${business.name}, ${business.address} · ${phoneDisplay(business.phone)} · ${business.email}`;

export const PRIVACY: LegalDoc = {
  key: 'privacy',
  path: '/privacy/',
  title: 'Privacy policy',
  seoTitle: 'Privacy Policy | The Wax Room, Midlothian VA',
  description: 'What The Wax Room collects, how it’s used, and your choices, including text messages.',
  updated: UPDATED,
  intro: 'This explains what we collect when you book with us or use this website, how we use it, who helps us run things, and the choices you have.',
  sections: [
    { id: 'who', title: 'Who we are', body: [`The Wax Room is a waxing and skin studio in Midlothian, Virginia. Questions about this policy: ${contact}.`] },
    {
      id: 'collect',
      title: 'What we collect',
      body: [
        [
          'Your details: name, mobile number, email, and your birthday if you share it.',
          'Your appointments: the services you book, when, with whom, and notes your esthetician keeps to look after you (for example a sensitivity or a product to avoid).',
          'Payments: cards are handled by Stripe. We see the card type, last four digits and expiry date, never the full number.',
          'Messages: the texts and emails we send you about your appointments, and your replies, including any rating you send after a visit.',
          'Website use: the pages you visit and the booking steps you take, measured with tools from Meta and PostHog, unless you opt out (see “Your choices”).',
        ],
      ],
    },
    {
      id: 'use',
      title: 'How we use it',
      body: [
        [
          'To book, change and keep your appointments, and to send your confirmations, reminders and receipts.',
          'To take deposits and fees under our cancellation and no-show policy, and to bill memberships and packages you choose.',
          'To answer your questions and look after you at your visit.',
          'To send offers and news, only if you opted in.',
          'To credit referrals, and to understand how the website and our ads are working.',
        ],
      ],
    },
    {
      id: 'texts',
      title: 'Text messages',
      body: [
        'We use your mobile number to send the texts described in our [texting terms](/terms/#texts).',
        'No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. Text messaging opt-in data and consent are not shared with any third parties.',
        'Reply STOP to any text to stop them, or use our [text message opt-out form](/text-opt-out/).',
      ],
    },
    {
      id: 'share',
      title: 'Who helps us',
      body: [
        'We don’t sell your personal information. We share it only with the companies that run parts of our service for us, and only so they can do that:',
        [
          'Stripe, for payments.',
          'Twilio, to send text messages.',
          'Google, for email.',
          'Amazon Web Services, which hosts this website and our booking system.',
          'Meta and PostHog, for website analytics and measuring our ads.',
          'GlossGenius, our earlier booking system, which holds records from before we moved.',
        ],
        'We may also share information if the law requires it, or to protect our clients, our team or the studio.',
      ],
    },
    {
      id: 'choices',
      title: 'Your choices',
      body: [
        [
          'Texts: reply STOP to any text, or use the [opt-out form](/text-opt-out/). You can stop offers only and keep your appointment texts.',
          'Website tracking: use “Your privacy choices” at the bottom of any page. If your browser sends a Global Privacy Control signal, we treat it as an opt-out.',
          `Your information: you can ask to see, correct or delete what we hold about you by emailing ${business.email}. We may keep records the law requires, such as payment records.`,
        ],
      ],
    },
    {
      id: 'keep',
      title: 'How long we keep it, and keeping it safe',
      body: [
        'We keep your information while you’re a client and for as long as we need it for our records afterwards. It’s stored with the providers above, who protect it with encryption, and only our team can see it. Employees see clients’ phone numbers and emails only when the owner allows it.',
      ],
    },
    { id: 'children', title: 'Children', body: ['This website isn’t meant for children under 13, and we don’t knowingly collect their information.'] },
    { id: 'changes', title: 'Changes', body: ['If we change this policy, we’ll update it here with a new date.'] },
  ],
};

export const TERMS: LegalDoc = {
  key: 'terms',
  path: '/terms/',
  title: 'Terms of service',
  seoTitle: 'Terms of Service | The Wax Room, Midlothian VA',
  description: 'The terms for booking and visiting The Wax Room, including texting terms.',
  updated: UPDATED,
  intro: 'These terms apply when you book with us, visit the studio or use this website. By booking, you agree to them.',
  sections: [
    {
      id: 'booking',
      title: 'Booking',
      body: [
        'Please give us accurate details so we can reach you about your appointment. We may ask for a card to hold a booking; it’s saved with Stripe and charged only as these terms and our policy describe.',
        'New Client Rituals are priced for your first visit for that service. If you’ve had that service with us before, book the service itself.',
      ],
    },
    {
      id: 'cancellations',
      title: 'Deposits, cancellations and no-shows',
      body: [
        'Our cancellation and no-show policy, shown when you book, applies to every appointment. A deposit comes off your total at your visit. If you cancel early enough under the policy it’s refunded; otherwise it’s kept and goes toward any fee.',
        '{cancellation-policy}',
      ],
    },
    {
      id: 'payments',
      title: 'Prices, memberships and packages',
      body: [
        [
          'Prices are as listed when you book. Some services start at a price and depend on what you need.',
          'Memberships are billed monthly to your card until you cancel. To cancel, contact us before your next billing date.',
          'Packages are paid for up front and are for the person who bought them. Services already used aren’t refunded.',
          'Referral credit and thank-you gifts have no cash value and can’t be exchanged.',
        ],
      ],
    },
    {
      id: 'health',
      title: 'Your health and your results',
      body: [
        'Before your visit, tell us about anything that could affect your service, such as medications (including retinoids and acne treatments), pregnancy, skin conditions, recent sun exposure or allergies. We may adjust, postpone or decline a service if it isn’t right for you that day.',
        'Everyone’s skin and hair are different, so results vary and aren’t guaranteed. Some redness or sensitivity after waxing or skin treatments is normal; follow the aftercare we give you and let us know if anything concerns you.',
      ],
    },
    {
      id: 'v-steam',
      title: 'V-steam',
      body: [
        'V-steam (yoni steam) is a relaxation and self-care ritual. It isn’t a medical treatment, isn’t intended to diagnose, treat, cure or prevent any condition, and we make no claims about health benefits. It isn’t a substitute for care from your healthcare provider.',
        'Please don’t steam if you’re pregnant or could be, on your period, or have an active infection, and check with your healthcare provider first if you have any health condition or concerns. The steam is warm: tell us right away if it feels too hot or uncomfortable, and you can stop at any time. By choosing a V-steam, you confirm you’ve read this.',
      ],
    },
    {
      id: 'texts',
      title: 'Texting terms',
      body: [
        [
          'Appointment texts: when you book, The Wax Room texts the mobile number you give us about your appointments: booking confirmations, reminders, requests to confirm, changes, cancellations and receipts. After a visit we may ask you to rate it, and if a service is due again we may invite you to rebook.',
          'Offers and news: only if you opt in and confirm by replying YES to our text, up to 4 a month. Agreeing to offers is never a condition of booking or buying.',
          'Message frequency varies, usually 2 to 4 texts per visit. Message and data rates may apply.',
          `Reply STOP to stop all texts, or use our [opt-out form](/text-opt-out/). Reply START to get appointment texts again. Reply HELP for help, or contact us at ${phoneDisplay(business.phone)} or ${business.email}.`,
          'Carriers aren’t liable for delayed or undelivered messages.',
          'How we handle your number: our [privacy policy](/privacy/#texts).',
        ],
      ],
    },
    {
      id: 'website',
      title: 'This website',
      body: [
        'Photos show our work or are for illustration. Reviews come from our Google Business Profile. We keep the menu and prices up to date, but if something on the site is wrong, the price confirmed when you book applies.',
      ],
    },
    {
      id: 'liability',
      title: 'Our responsibility',
      body: [
        'We perform every service with reasonable care and skill. To the extent the law allows, we aren’t responsible for indirect or unforeseeable losses, and our responsibility for any service is limited to what you paid for it. Nothing in these terms limits rights you have under Virginia law that can’t be limited.',
      ],
    },
    { id: 'law', title: 'Changes and governing law', body: ['We may update these terms; the version on this page when you book applies. These terms are governed by the laws of Virginia.', `Questions: ${contact}.`] },
  ],
};

export const LEGAL_DOCS = [PRIVACY, TERMS];
