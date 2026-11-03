/*
 * Service worker do Sodalis: guarda só o app shell (index.html e os arquivos de /assets/).
 * Nunca guarda respostas de API, Firestore, Storage ou qualquer dado pessoal.
 * A cópia mínima da carteirinha para uso offline fica no localStorage (sem CPF),
 * e é apagada ao sair da conta.
 */
const CACHE = 'sodalis-shell-v2';
const SHELL = ['/', '/index.html', '/favicon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Só a própria origem; nada de API, funções, Firestore ou Storage
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ics')) return;

  // Navegação: rede primeiro, shell em cache quando estiver sem internet
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }
  // Arquivos versionados do build: cache primeiro
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        hit =>
          hit ||
          fetch(req).then(res => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then(c => c.put(req, copy));
            }
            return res;
          })
      )
    );
  }
});

// ---------- Notificação no celular (push pelo Firebase Cloud Messaging) ----------
// O servidor manda só dados: { title, body, link }. Aqui mostramos a notificação.
self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {};
  }
  const d = payload.data || payload.notification || payload;
  const title = d.title || 'Nova notificação';
  const link = typeof d.link === 'string' && d.link.startsWith('/') ? d.link : '/entrar';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { link },
      tag: link,
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/entrar';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
          c.navigate(link);
          return c.focus();
        }
      }
      return self.clients.openWindow(link);
    })
  );
});
