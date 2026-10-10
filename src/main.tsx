import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.tsx';

// Pages are pre-rendered to static HTML for search engines (scripts/prerender.mjs);
// the client renders fresh over it so time-based bits (open now, review dates) are current.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App path={location.pathname} />
  </StrictMode>,
);
