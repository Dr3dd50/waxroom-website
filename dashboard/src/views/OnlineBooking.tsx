// Settings → Online booking (owner): bring the GlossGenius export in, and switch our
// own online booking on once the calendar has every GlossGenius booking on it.
import { useState } from 'react';
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
          Clients: {r.clients.added} new, {r.clients.matched} already here, {r.clients.skipped} skipped (banned, or no name or phone).
        </p>
      ) : null}
      {r.appointments ? (
        <p className="small">
          Appointments: {r.appointments.added} new, {r.appointments.updated} changed since last time, {r.appointments.unchanged} unchanged
          {r.appointments.unmatched ? `, ${r.appointments.unmatched} couldn’t be matched` : ''}.
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
  const last = s.glossGeniusImport;
  const ready = !!(last?.clients && last.appointments);
  const [files, setFiles] = useState<{ clients?: string; appointments?: string }>({});
  const [check, setCheck] = useState<ImportReport | null>(null);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [picker, setPicker] = useState(0); // a new key empties the file inputs after an import

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
  async function setOpen(open: boolean) {
    setError('');
    setBusy('switch');
    try {
      await api('/online-booking', { open, confirm: open ? sure : undefined });
      setSure(false);
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
        Online booking here {s.onlineBooking.open ? <Pill tone="green">Open</Pill> : <Pill tone="neutral">Closed: clients book on GlossGenius</Pill>}
      </h2>
      {s.onlineBooking.changedAt ? (
        <p className="muted small">
          {s.onlineBooking.open ? 'Opened' : 'Closed'} by {s.onlineBooking.changedBy} on {when(s.onlineBooking.changedAt)}.
        </p>
      ) : null}

      <h3 className="mt">1. Bring over GlossGenius</h3>
      <p className="small muted">
        Export your clients (GlossGenius → Clients → Export) and your appointments (Insights, or ask GlossGenius support). Upload both here. Check them first:
        nothing is saved until you press Import. Import again whenever you like while both are running. GlossGenius bookings then block those times here,
        and changes made there (a cancellation, say) come across. Our system doesn’t text clients about GlossGenius bookings, because GlossGenius already does.
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

      <h3 className="mt">2. Open online booking here</h3>
      {s.onlineBooking.open ? (
        <>
          <p className="small muted">
            Clients book, join memberships and buy packages on our site. Close it to send them back to GlossGenius. Bookings already made here stay on the calendar.
          </p>
          <button className="btn btn--ghost mt" disabled={!!busy} onClick={() => setOpen(false)}>
            Close online booking
          </button>
        </>
      ) : !ready ? (
        <p className="small muted">Import both the clients and the appointments first. Then the calendar has every GlossGenius booking on it before anyone can book here.</p>
      ) : (
        <>
          <p className="small muted">
            Before you open it, look through the calendar and compare it with GlossGenius. Once it’s open, clients book here from the website. GlossGenius keeps working for
            bookings made there, so import again regularly until you close GlossGenius booking.
          </p>
          <label className="check mt">
            <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /> I’ve checked the calendar and want clients to book here.
          </label>
          <button className="btn btn--honey mt" disabled={!sure || !!busy} onClick={() => setOpen(true)}>
            Open online booking
          </button>
        </>
      )}
      {error ? <p className="form-error">{error}</p> : null}
    </section>
  );
}
