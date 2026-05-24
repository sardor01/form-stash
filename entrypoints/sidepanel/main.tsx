import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../../src/sidepanel/App';
import '../../src/sidepanel/style.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
