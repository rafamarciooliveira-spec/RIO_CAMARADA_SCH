import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Sem zoom de pinça no celular (o iPhone ignora o user-scalable=no do viewport): o zoom cortava as janelas
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener(
  'touchmove',
  e => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false }
);

createRoot(document.getElementById('root')!).render(<App />);
