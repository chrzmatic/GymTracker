/**
 * Cliente mínimo do Chrome DevTools Protocol, para rodar código dentro do
 * app num navegador de verdade (IndexedDB real). Sem dependências.
 */

/**
 * Espera a porta de depuração e conecta na primeira aba.
 * @param {number} [porta] a de --remote-debugging-port
 * @returns {Promise<{avaliar: (expressao: string) => Promise<*>, enviar: Function, fechar: Function}>}
 */
export async function conectar(porta = 9222) {
  const pagina = await esperarPagina(porta);
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((ok, erro) => {
    ws.onopen = ok;
    ws.onerror = () => erro(new Error('Não consegui abrir o WebSocket do navegador.'));
  });

  let id = 0;
  const pendentes = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (!msg.id || !pendentes.has(msg.id)) return;
    const { ok, erro } = pendentes.get(msg.id);
    pendentes.delete(msg.id);
    if (msg.error) erro(new Error(JSON.stringify(msg.error)));
    else ok(msg.result);
  };

  const enviar = (metodo, params = {}) =>
    new Promise((ok, erro) => {
      id += 1;
      pendentes.set(id, { ok, erro });
      ws.send(JSON.stringify({ id, method: metodo, params }));
    });

  return {
    enviar,
    fechar: () => ws.close(),

    /** Roda uma expressão (pode ser async) na página e devolve o valor. */
    async avaliar(expressao) {
      const r = await enviar('Runtime.evaluate', {
        expression: expressao,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.exceptionDetails) {
        const e = r.exceptionDetails;
        throw new Error('Erro dentro da página: ' + (e.exception?.description ?? e.text));
      }
      return r.result.value;
    },
  };
}

/** Lê a lista de alvos até o navegador responder. */
async function esperarPagina(porta, tentativas = 40) {
  for (let i = 0; i < tentativas; i += 1) {
    try {
      const resposta = await fetch(`http://127.0.0.1:${porta}/json/list`);
      const alvos = await resposta.json();
      const pagina = alvos.find((a) => a.type === 'page' && a.webSocketDebuggerUrl);
      if (pagina) return pagina;
    } catch {
      /* Navegador ainda subindo. */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('O navegador não abriu a porta de depuração.');
}

/** Caminho do navegador: GYMTRACKER_NAVEGADOR, ou o Edge/Chrome do Windows. */
export function acharNavegador() {
  const doAmbiente = Deno.env.get('GYMTRACKER_NAVEGADOR');
  if (doAmbiente) return doAmbiente;

  const pf = Deno.env.get('ProgramFiles') ?? 'C:\\Program Files';
  const pf86 = Deno.env.get('ProgramFiles(x86)') ?? 'C:\\Program Files (x86)';
  const local = Deno.env.get('LOCALAPPDATA') ?? '';
  const candidatos = [
    `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
    `${local}\\Google\\Chrome\\Application\\chrome.exe`,
  ];
  for (const caminho of candidatos) {
    try {
      Deno.statSync(caminho);
      return caminho;
    } catch {
    }
  }
  throw new Error('Não achei o Edge nem o Chrome instalados.');
}

/**
 * Flags do navegador de teste. Além do headless, cortam downloads de fundo
 * que enchiam o disco a cada perfil novo.
 */
const FLAGS = [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-client-side-phishing-detection',
  '--disable-domain-reliability',
  '--disable-sync',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-breakpad',
  '--no-pings',
  '--metrics-recording-only',
  '--disable-features=Translate,OptimizationHints,MediaRouter,InterestFeedContentSuggestions',
];

/** Flags extras de GYMTRACKER_NAVEGADOR_FLAGS (ex.: `--no-sandbox` como root no Linux). */
function flagsDoAmbiente() {
  return (Deno.env.get('GYMTRACKER_NAVEGADOR_FLAGS') ?? '').split(' ').filter(Boolean);
}

/**
 * Sobe um navegador num perfil temporário, apagado por `encerrar()`.
 * @param {{url: string, porta: number}} opcoes
 * @returns {Promise<{perfil: string, encerrar: () => Promise<void>}>}
 */
export async function lancarNavegador({ url, porta }) {
  const perfil = await Deno.makeTempDir({ prefix: 'gymtracker-teste-' });

  const processo = new Deno.Command(acharNavegador(), {
    args: [
      ...FLAGS,
      ...flagsDoAmbiente(),
      `--remote-debugging-port=${porta}`,
      `--user-data-dir=${perfil}`,
      url,
    ],
    stdout: 'null',
    stderr: 'null',
  }).spawn();

  return {
    perfil,

    /**
     * Fecha o navegador e apaga o perfil.
     * Pede `Browser.close` ao navegador: matar pelo PID não basta, porque o
     * Edge se relança com outro PID.
     * @param {Object} [cdp] cliente de `conectar`
     */
    async encerrar(cdp) {
      if (cdp) {
        try {
          await cdp.enviar('Browser.close');
        } catch {
          /* Já pode ter caído. */
        }
        try {
          cdp.fechar();
        } catch {
          /* WebSocket já fechado. */
        }
      }

      await matarArvore(processo);
      await processo.status;
      await apagarComInsistencia(perfil);
    },
  };
}

/**
 * Encerra o navegador e os processos filhos (no Windows, `taskkill /T`).
 * Filhos vivos seguram arquivos do perfil e impedem apagá-lo.
 */
async function matarArvore(processo) {
  if (Deno.build.os === 'windows') {
    try {
      await new Deno.Command('taskkill', {
        args: ['/PID', String(processo.pid), '/T', '/F'],
        stdout: 'null',
        stderr: 'null',
      }).output();
      return;
    } catch {
      /* Sem taskkill: usa o kill comum. */
    }
  }
  try {
    processo.kill();
  } catch {
    /* Já encerrou. */
  }
}

/**
 * Apaga a pasta do perfil, tentando de novo enquanto ela estiver presa.
 * Se não conseguir, só avisa.
 */
async function apagarComInsistencia(caminho) {
  for (let tentativa = 0; tentativa < 15; tentativa += 1) {
    try {
      await Deno.remove(caminho, { recursive: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  console.warn(`[teste] não consegui apagar o perfil temporário: ${caminho}`);
}

/**
 * Servidor de arquivos para os testes.
 * @param {string} raiz pasta do projeto
 * @returns {{porta: number, parar: () => Promise<void>}}
 */
export function servir(raiz) {
  const tipos = {
    html: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    json: 'application/json; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
  };
  const servidor = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
    let caminho = new URL(req.url).pathname;
    if (caminho === '/') caminho = '/index.html';
    // Página em branco do mesmo domínio, para o teste de migração mexer
    // no banco antes de o app abrir.
    if (caminho === '/__vazio') {
      return new Response('<!doctype html><meta charset="utf-8"><title>vazio</title>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    try {
      const arquivo = await Deno.readFile(raiz + caminho);
      const ext = caminho.split('.').pop();
      return new Response(arquivo, {
        headers: {
          'content-type': tipos[ext] ?? 'application/octet-stream',
          'cache-control': 'no-store',
        },
      });
    } catch {
      return new Response('404', { status: 404 });
    }
  });
  return { porta: servidor.addr.port, parar: () => servidor.shutdown() };
}
