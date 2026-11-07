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

// Depois de uma publicação, uma tela que ainda não tinha sido aberta pode pedir um arquivo antigo que
// não existe mais: recarrega uma vez para pegar a versão nova (em vez de mostrar erro)
window.addEventListener('vite:preloadError', e => {
  try {
    if (sessionStorage.getItem('sodalis_reloaded') === '1') return;
    sessionStorage.setItem('sodalis_reloaded', '1');
  } catch {
    /* modo privado */
  }
  e.preventDefault();
  location.reload();
});
window.setTimeout(() => {
  try {
    sessionStorage.removeItem('sodalis_reloaded');
  } catch {
    /* modo privado */
  }
}, 15000);

createRoot(document.getElementById('root')!).render(<App />);
