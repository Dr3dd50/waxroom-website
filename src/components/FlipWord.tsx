import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type Props = {
  word: string;
  /** Delay before this word starts flipping (ms), so neighbouring words cascade. */
  delay?: number;
};

export const HALF_FLIP_MS = 300;

/**
 * Flip-clock motion without the clock: when `word` changes, the top half of the
 * old word folds down and away while the new word's top appears, then the new
 * bottom half swings down into place. No card, just the letters.
 * The slot's width eases to fit each new word so surrounding text glides.
 */
export function FlipWord({ word, delay = 0 }: Props) {
  const [shown, setShown] = useState(word);
  const [flip, setFlip] = useState<{ from: string; to: string; id: number } | null>(null);
  const [width, setWidth] = useState<number>();
  const shownRef = useRef(word);
  const measure = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (word === shownRef.current) return;
    const from = shownRef.current;
    shownRef.current = word;
    const start = window.setTimeout(() => setFlip({ from, to: word, id: Date.now() }), delay);
    const end = window.setTimeout(() => {
      setShown(word);
      setFlip(null);
    }, delay + HALF_FLIP_MS * 2 + 40);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(end);
      setShown(word);
      setFlip(null);
    };
  }, [word, delay]);

  // Size the slot to the incoming word; re-measure when web fonts swap in.
  const target = flip ? flip.to : shown;
  useLayoutEffect(() => {
    const el = measure.current!;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [target]);

  return (
    <span className={`flip ${flip ? 'is-flipping' : ''}`} aria-hidden="true" style={{ width }}>
      <span className="flip__measure" ref={measure}>
        {target}
      </span>
      <span className="flip__half flip__half--top">
        <span>{flip ? flip.to : shown}</span>
      </span>
      <span className="flip__half flip__half--bottom">
        <span>{flip ? flip.from : shown}</span>
      </span>
      {flip && (
        <>
          <span key={`t${flip.id}`} className="flip__half flip__half--top flip__leaf flip__leaf--top">
            <span>{flip.from}</span>
          </span>
          <span key={`b${flip.id}`} className="flip__half flip__half--bottom flip__leaf flip__leaf--bottom">
            <span>{flip.to}</span>
          </span>
        </>
      )}
    </span>
  );
}
