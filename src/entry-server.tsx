import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import App from './App';
import { headFor, PRERENDER_PATHS, resolve } from './routes';

export { PRERENDER_PATHS };

export function render(path: string) {
  const html = renderToString(
    <StrictMode>
      <App path={path} />
    </StrictMode>,
  );
  return { html, head: headFor(resolve(path)) };
}
