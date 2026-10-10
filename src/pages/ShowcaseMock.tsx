// Temporary review page: the three service showcase options, one after another.
// Not linked or pre-rendered; delete once an option is chosen.
import { ShowcaseBento, ShowcaseList, ShowcaseStory } from '../sections/Showcase';

const Label = ({ id, title, note }: { id: string; title: string; note: string }) => (
  <div className="mock-label" id={id}>
    <div className="container">
      <b>{title}</b> <span>{note}</span>
    </div>
  </div>
);

export function ShowcaseMock() {
  return (
    <div className="mock-page">
      <Label id="a" title="Option A · Editorial index" note="Problems as big rows. Hover floats the doodle; click opens every named service with prices." />
      <ShowcaseList />
      <Label id="b" title="Option B · Bento grid" note="One doodle tile per problem, Waxing biggest; each tile has a dropdown of its services." />
      <ShowcaseBento />
      <Label id="c" title="Option C · Sticky story" note="One doodle frame stays put and changes as you scroll; each problem has a services dropdown." />
      <ShowcaseStory />
    </div>
  );
}
