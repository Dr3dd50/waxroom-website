// Settings → Switch from GlossGenius (owner). Until the switch, GlossGenius is the
// only booking system: nothing here books, texts or charges. The owner brings the
// GlossGenius export in (as often as needed), then switches once GlossGenius has
// stopped taking bookings and its last ones are imported.
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useBoot } from '../ctx';
import type { ImportReport } from '../types';
import { Pill } from '../ui';

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

function ReportLines({ r }: { r: ImportReport }) {
  return (
    <>
      {r.clients ? (
        <p className="small">
          Clients: {r.clients.added} new, {r.clients.matched} already in the new system
          {r.clients.duplicates ? `, ${r.clients.duplicates} listed twice in the file (merged)` : ''}.
          {r.clients.noPhone ? ` ${r.clients.noPhone} have no mobile number, so they won’t get texts.` : ''}
          {r.clients.sharedPhone ? ` ${r.clients.sharedPhone} share a phone with someone listed before them, so they come in without it (noted on their card).` : ''}
          {r.clients.banned ? ` ${r.clients.banned} are banned in GlossGenius and stay banned: they can’t book online.` : ''}
          {r.clients.skipped ? ` ${r.clients.skipped} rows have no name and are left out.` : ''}
        </p>
      ) : null}
      {r.appointments ? (
        <p className="small">
          Appointments: {r.appointments.added} new, {r.appointments.updated} changed since last time, {r.appointments.unchanged} unchanged
          {r.appointments.removed ? `, ${r.appointments.removed} no longer in GlossGenius (moved or deleted there, so freed here)` : ''}
          {r.appointments.unmatched ? `, ${r.appointments.unmatched} not brought in` : ''}.
        </p>
      ) : null}
      {r.appointments?.problems.length ? (
        <details className="small">
          <summary>Rows to check by hand ({r.appointments.problems.length})</summary>
          <ul>
            {r.appointments.problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

export function OnlineBooking() {
  const boot = useBoot();
  const s = boot.settings;
  const done = s.switchover.done;
  const last = s.glossGeniusImport;
  const [files, setFiles] = useState<{ clients?: string; appointments?: string }>({});
  const [check, setCheck] = useState<ImportReport | null>(null);
  const [blockers, setBlockers] = useState<string[] | null>(null);
  const [ggOff, setGgOff] = useState(false);
  const [remind, setRemind] = useState(false);
  const [back, setBack] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [picker, setPicker] = useState(0); // a new key empties the file inputs after an import

  useEffect(() => {
    if (!done) api<{ blockers: string[] }>('/switchover').then((r) => setBlockers(r.blockers), () => setBlockers(null));
  }, [done, last?.at]);

  const read = (key: 'clients' | 'appointments') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setCheck(null);
    setFiles((x) => ({ ...x, [key]: undefined }));
    if (f) {
      const text = await f.text();
      setFiles((x) => ({ ...x, [key]: text }));
    }
  };
  async function run(dryRun: boolean) {
    setError('');
    setBusy(dryRun ? 'check' : 'import');
    try {
      const r = await api<{ report: ImportReport }>('/import/glossgenius', { ...files, dryRun });
      if (dryRun) setCheck(r.report);
      else {
        setCheck(null);
        setFiles({});
        setPicker((n) => n + 1);
        await boot.reload();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function setSwitched(on: boolean) {
    setError('');
    setBusy('switch');
    try {
      await api('/switchover', on ? { done: true, glossGeniusOff: ggOff, remindImported: remind } : { done: false, confirm: back });
      setGgOff(false);
      setRemind(false);
      setBack(false);
      await boot.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="card-panel">
      <h2>
        Switch from GlossGenius {done ? <Pill tone="green">Switched</Pill> : <Pill tone="neutral">GlossGenius is still your booking system</Pill>}
      </h2>
      {done ? (
        <>
          <p className="small">
            Switched by {s.switchover.by} on {when(s.switchover.at)}. Bookings, payments and texts all run here now.
            {s.switchover.remindImported ? ' Appointments brought over from GlossGenius get our reminders too.' : ' Appointments brought over from GlossGenius don’t get our reminders.'}
          </p>
          <details className="small mt">
            <summary>Go back to GlossGenius</summary>
            <p className="muted">
              Everything here stops: online booking, texts and payments. Bookings made here stay on this calendar but aren’t in GlossGenius, so you’d need to add them there by
              hand.
            </p>
            <label className="check mt">
              <input type="checkbox" checked={back} onChange={(e) => setBack(e.target.checked)} /> I want to go back to GlossGenius.
            </label>
            <button className="btn btn--ghost mt" disabled={!back || !!busy} onClick={() => setSwitched(false)}>
              Go back to GlossGenius
            </button>
          </details>
        </>
      ) : (
        <>
          <p className="small muted">
            Until you switch, nothing here books, texts or charges anyone. Clients book on GlossGenius, and the website’s Book buttons go there. That way only one
            system takes bookings, so no time can be booked twice.
          </p>

          <h3 className="mt">1. Bring over GlossGenius</h3>
          <p className="small muted">
            Export your clients (GlossGenius → Clients → Export) and your appointments (Insights, or ask GlossGenius support), and upload both. Check them first: nothing is
            saved until you press Import. Import as often as you like; it adds what’s new and brings cancellations across.
          </p>
          <div className="two mt">
            <label className="field">
              Clients file (.csv)
              <input key={`c${picker}`} type="file" accept=".csv,text/csv" onChange={read('clients')} />
            </label>
            <label className="field">
              Appointments file (.csv)
              <input key={`a${picker}`} type="file" accept=".csv,text/csv" onChange={read('appointments')} />
            </label>
          </div>
          <div className="row-actions mt">
            <button className="btn btn--ghost" disabled={!!busy || (!files.clients && !files.appointments)} onClick={() => run(true)}>
              {busy === 'check' ? 'Checking…' : 'Check the files'}
            </button>
            <button className="btn btn--dark" disabled={!!busy || !check} onClick={() => run(false)}>
              {busy === 'import' ? 'Importing…' : 'Import'}
            </button>
          </div>
          {check ? (
            <div className="note mt">
              <strong>What the import will do</strong>
              <ReportLines r={check} />
            </div>
          ) : null}
          {last ? (
            <div className="mt">
              <p className="small">
                Last import: {when(last.at)} by {last.by}.
              </p>
              <ReportLines r={last} />
            </div>
          ) : null}

          <h3 className="mt">2. Switch</h3>
          <ol className="small">
            <li>In GlossGenius, turn off online booking, so no new bookings come in there.</li>
            <li>Export the appointments once more and import them here, so the last GlossGenius bookings are on this calendar.</li>
            <li>Look over the calendar, then switch. Online booking, payments and texts all start here at that moment.</li>
          </ol>
          {blockers?.length ? (
            <div className="note mt">
              <strong>Still needed</strong>
              <ul className="small">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <label className="check mt">
            <input type="checkbox" checked={ggOff} onChange={(e) => setGgOff(e.target.checked)} /> Online booking is off in GlossGenius, and I imported after turning it off.
          </label>
          <label className="check">
            <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} /> Send our reminders for the appointments brought over from GlossGenius (turn
            GlossGenius’s reminders off first, or clients get both).
          </label>
          <button className="btn btn--honey mt" disabled={!ggOff || !!blockers?.length || !!busy} onClick={() => setSwitched(true)}>
            Switch to our booking
          </button>
        </>
      )}
      {error ? <p className="form-error">{error}</p> : null}
    </section>
  );
}
