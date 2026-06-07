import './styles.css';
import { initApp } from './app';

initApp().catch((err) => {
  console.error('[ydpro] startup failed:', err);
});
