// /text-messages/: how clients agree to texts from The Wax Room, shown exactly as they
// see it, for Twilio's campaign registration (proof of opt-in). Nobody signs up here.
// The words come from src/data/texting.json, the same file the booking form and the
// booking system use.
import texting from '../data/texting.json';
import { business, phoneDisplay } from '../data';

const Bubble = ({ children, from = 'us' }: { children: string; from?: 'us' | 'client' }) => (
  <p className={`sms-bubble sms-bubble--${from}`}>{children}</p>
);

export function TextingProofPage() {
  return (
    <section className="book">
      <div className="container legal">
        <p className="eyebrow">The Wax Room</p>
        <h1 className="display book__title">
          Text messages <em>from us.</em>
        </h1>
        <p className="lead">How clients agree to texts from The Wax Room, what we send, and how to stop.</p>

        <section className="legal__section" id="booking">
          <h2>Booking online</h2>
          <p>
            The last step of booking asks for a mobile number. Appointment texts come with booking, and the form says so next to the button. Offers and news are a
            separate, optional box that starts unticked.
          </p>
          <div className="proof-form" aria-label="The booking form, as clients see it">
            <label className="field">
              Mobile
              <input type="tel" disabled placeholder="(804) 555-0123" />
            </label>
            <label className="check">
              <input type="checkbox" disabled /> {texting.offersLabel}
            </label>
            <p className="fine">
              {texting.appointmentConsent} <a href="/terms/#texts">Texting terms</a> · <a href="/privacy/">Privacy policy</a>
            </p>
            <span className="btn btn--honey proof-form__btn">Continue to card</span>
          </div>
          <p className="muted small">The same wording is on the membership and package sign-up pages.</p>
        </section>

        <section className="legal__section" id="offers">
          <h2>Joining offers and news</h2>
          <p>Ticking the box doesn’t add anyone yet. The number gets one text, and offers start only after a YES reply:</p>
          <div className="sms-thread">
            <Bubble>{texting.offersConfirm}</Bubble>
            <Bubble from="client">YES</Bubble>
            <Bubble>{texting.offersWelcome}</Bubble>
          </div>
        </section>

        <section className="legal__section" id="studio">
          <h2>At the studio</h2>
          <p>
            When we add a client at the front desk, we ask “Can we text you about your appointments?” and record the answer, who asked and when. We only add them to offers
            if they ask for them.
          </p>
        </section>

        <section className="legal__section" id="messages">
          <h2>What we send</h2>
          <ul>
            <li>Appointment texts: booking confirmations, reminders, requests to confirm, changes, cancellations and receipts. Usually 2 to 4 per visit.</li>
            <li>After a visit, we may ask for a 1 to 5 rating, and invite clients to rebook when a service is due again.</li>
            <li>Offers and news: only for clients who replied YES, up to 4 a month.</li>
            <li>Message and data rates may apply. Message frequency varies.</li>
          </ul>
          <p>Examples:</p>
          <div className="sms-thread">
            <Bubble>{`Hi Ava! You’re booked for Brazilian with Nyeesha on Fri, Oct 23 at 2:00 PM. Add it to your calendar: waxroomrichmond.com/api/cal/… Manage your booking: waxroomrichmond.com/booking/?t=…\n${texting.firstTextLine}`}</Bubble>
            <Bubble>Reminder: Brazilian tomorrow at 2:00 PM at The Wax Room, 11162 Hull Street Rd N. Let hair grow to about ¼ inch and skip lotion on the area.</Bubble>
            <Bubble>{'New here? The New Client Ritual is a Brazilian and a complimentary 1-hour V-steam for $49: waxroomrichmond.com/offers/new-client-ritual/\nReply STOP to opt out'}</Bubble>
          </div>
        </section>

        <section className="legal__section" id="stop">
          <h2>Stopping texts</h2>
          <ul>
            <li>Reply STOP to any text to stop all texts. Reply START to get appointment texts again.</li>
            <li>
              Or use our <a href="/text-opt-out/">text message opt-out form</a>, which can stop offers only or every text.
            </li>
            <li>
              Reply HELP for help, or contact us at {phoneDisplay(business.phone)} or {business.email}.
            </li>
          </ul>
          <p>
            Full details: <a href="/terms/#texts">texting terms</a> and <a href="/privacy/#texts">privacy policy</a>. No mobile information will be shared with third
            parties or affiliates for marketing or promotional purposes.
          </p>
        </section>
      </div>
    </section>
  );
}
