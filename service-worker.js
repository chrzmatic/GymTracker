/**
 * Service worker: faz o app funcionar offline e avisar quando há versão nova.
 *
 * Estratégia: **cache primeiro** para os arquivos do app. Eles mudam só
 * quando eu publico uma versão nova, e na academia a conexão costuma ser
 * ruim — esperar a rede para abrir a tela de registro seria o pior lugar
 * possível para travar.
 *
 * Os dados do usuário não passam por aqui: ficam no IndexedDB, que é
 * independente do cache.
 *
 * ## Ao publicar uma versão nova
 *
 * Trocar `VERSAO` abaixo. Isso cria um cache novo, faz o service worker
 * novo instalar em paralelo, e o app mostra "Nova versão disponível" com
 * um botão de recarregar. Os caches antigos são apagados na ativação.
 *
 * Se acrescentar arquivos ao projeto (a Etapa 6 vai acrescentar os da
 * dieta), incluí-los em `ARQUIVOS` — senão eles não ficam disponíveis
 * offline.
 */

const VERSAO = 'v11';
const CACHE = `gymtracker-${VERSAO}`;

/** Tudo que o app precisa para abrir sem rede. */
const ARQUIVOS = [
  './',
  './index.html',
  './manifest.json',

  './css/base.css',
  './css/components.css',

  './lib/chart.umd.min.js',

  './assets/icone.svg',
  './assets/icone-192.png',
  './assets/icone-512.png',

  './js/main.js',
  './js/atualizacao.js',
  './js/navegacao.js',

  './js/utils/constantes.js',
  './js/utils/date.js',
  './js/utils/format.js',
  './js/utils/id.js',

  './js/data/db.js',
  './js/data/config-repo.js',
  './js/data/exercicios-repo.js',
  './js/data/musculos-repo.js',
  './js/data/peso-corporal-repo.js',
  './js/data/series-repo.js',
  './js/data/sessoes-repo.js',
  './js/data/treinos-repo.js',
  './js/data/seed-treino.json',
  './js/data/seed-dieta.json',
  './js/data/dieta-repo.js',

  './js/domain/calendario.js',
  './js/domain/comparacao.js',
  './js/domain/csv.js',
  './js/domain/metricas.js',
  './js/domain/progressao.js',
  './js/domain/rotacao.js',
  './js/domain/series-semanais.js',
  './js/domain/nutricao.js',
  './js/domain/sessao.js',
  './js/domain/treino.js',

  './js/services/backup-service.js',
  './js/services/comparacao-service.js',
  './js/services/dieta-service.js',
  './js/services/exercicio-service.js',
  './js/services/peso-service.js',
  './js/services/progresso-service.js',
  './js/services/rotacao-service.js',
  './js/services/seed-service.js',
  './js/services/sessao-service.js',
  './js/services/treino-service.js',

  './js/components/dialogo.js',
  './js/components/ui.js',

  './js/views/calendario-view.js',
  './js/views/comparar-view.js',
  './js/views/configuracoes-view.js',
  './js/views/dieta-view.js',
  './js/views/dieta-editor-view.js',
  './js/views/exercicios-view.js',
  './js/views/historico-view.js',
  './js/views/musculos-view.js',
  './js/views/peso-view.js',
  './js/views/progresso-view.js',
  './js/views/treino-editor-view.js',
  './js/views/treino-view.js',
  './js/views/treinos-view.js',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll falha inteiro se um arquivo faltar, o que esconderia o
      // culpado. Guardando um a um dá para seguir e registrar qual falhou.
      await Promise.all(
        ARQUIVOS.map(async (arquivo) => {
          try {
            await cache.add(new Request(arquivo, { cache: 'reload' }));
          } catch (erro) {
            console.warn('[sw] não consegui guardar', arquivo, erro);
          }
        })
      );
    })()
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(
        nomes.filter((n) => n.startsWith('gymtracker-') && n !== CACHE).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  evento.respondWith(
    (async () => {
      const doCache = await caches.match(req, { ignoreSearch: true });
      if (doCache) return doCache;

      try {
        const daRede = await fetch(req);
        // Guarda o que vier novo (um arquivo esquecido na lista, por ex.).
        if (daRede && daRede.ok && daRede.type === 'basic') {
          const cache = await caches.open(CACHE);
          cache.put(req, daRede.clone());
        }
        return daRede;
      } catch (erro) {
        // Offline e fora do cache: numa navegação, devolve a casca do app
        // em vez da tela de dinossauro.
        if (req.mode === 'navigate') {
          const index = await caches.match('./index.html');
          if (index) return index;
        }
        throw erro;
      }
    })()
  );
});

/** A página pede para o service worker novo assumir agora. */
self.addEventListener('message', (evento) => {
  if (evento.data === 'assumir-agora') self.skipWaiting();
});
