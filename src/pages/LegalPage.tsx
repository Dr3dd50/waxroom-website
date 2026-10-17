// /privacy/ and /terms/: plain reading pages, each section linkable by its id.
import { Fragment, type ReactNode } from 'react';
import { business } from '../data';
import type { LegalDoc } from '../content/legal';

/** "[label](/path)" in a line becomes a link. */
function linked(text: string): ReactNode {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push(text.slice(last, m.index), <a key={m.index} href={m[2]}>{m[1]}</a>);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <section className="book">
      <div className="container legal">
        <p className="eyebrow">The Wax Room</p>
        <h1 className="display book__title">{doc.title}</h1>
        <p className="muted small">Last updated {doc.updated}</p>
        <p className="lead">{doc.intro}</p>
        {doc.sections.map((s) => (
          <section key={s.id} id={s.id} className="legal__section">
            <h2>{s.title}</h2>
            {s.body.map((b, i) =>
              Array.isArray(b) ? (
                <ul key={i}>
                  {b.map((li) => (
                    <li key={li}>{linked(li)}</li>
                  ))}
                </ul>
              ) : b === '{cancellation-policy}' ? (
                <div key={i} className="policy-text">
                  {business.cancellationPolicy.split(/\n+/).map((p, j) => (
                    <Fragment key={j}>
                      <p>{p}</p>
                    </Fragment>
                  ))}
                </div>
              ) : (
                <p key={i}>{linked(b)}</p>
              ),
            )}
          </section>
        ))}
      </div>
    </section>
  );
}
