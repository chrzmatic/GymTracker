/**
 * Mini cliente do Chrome DevTools Protocol.
 *
 * Serve para rodar código *dentro* do app num navegador de verdade, com
 * IndexedDB real e os mesmos módulos que o iPhone vai carregar. Os testes de
 * `tests/*.test.js` cobrem a camada domain (funções puras); este arquivo é o
 * que permite testar também services + data, que dependem do navegador.
 *
 * Sem dependências externas: o protocolo é só JSON sobre WebSocket.
 */

/**
 * Espera o navegador abrir a porta de depuração e conecta na primeira aba.
 * @param {number} [porta] porta passada em --remote-debugging-port
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

    /**
     * Roda uma expressão (pode ser async) na página e devolve o valor.
     * @param {string} expressao
     * @returns {Promise<*>}
     */
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

/** Tenta ler a lista de alvos do DevTools até o navegador responder. */
async function esperarPagina(porta, tentativas = 40) {
  for (let i = 0; i < tentativas; i += 1) {
    try {
      const resposta = await fetch(`http://127.0.0.1:${porta}/json/list`);
      const alvos = await resposta.json();
      const pagina = alvos.find((a) => a.type === 'page' && a.webSocketDebuggerUrl);
      if (pagina) return pagina;
    } catch {
      /* navegador ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('O navegador não abriu a porta de depuração.');
}

/**
 * Caminho do Edge ou do Chrome instalado no Windows.
 * @returns {string}
 */
export function acharNavegador() {
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
      /* próximo */
    }
  }
  throw new Error('Não achei o Edge nem o Chrome instalados.');
}

/**
 * Flags do navegador de teste.
 *
 * As primeiras são o básico de headless. O resto existe por um motivo
 * concreto: um perfil recém-criado faz o Chromium baixar dados de
 * componente — listas de Safe Browsing, modelos de otimização, caches de
 * shader — que pesam muito mais que o perfil em si. Como cada execução
 * cria um perfil novo, isso se multiplicava por dezenas de rodadas e
 * enchia o disco. Nada disso é necessário para abrir uma página local.
 */
const FLAGS = [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  // Corta as conexões de fundo: atualização de componentes, Safe
  // Browsing, telemetria. É o que mais engordava o perfil.
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

/**
 * Sobe um navegador de teste num perfil descartável.
 *
 * O perfil é apagado por `encerrar()`. Antes isso não existia e cada
 * rodada deixava uma pasta para trás no Temp — depois de algumas dezenas
 * de execuções, vira gigabytes de lixo que ninguém vai limpar na mão.
 *
 * @param {{url: string, porta: number}} opcoes
 * @returns {Promise<{perfil: string, encerrar: () => Promise<void>}>}
 */
export async function lancarNavegador({ url, porta }) {
  const perfil = await Deno.makeTempDir({ prefix: 'gymtracker-teste-' });

  const processo = new Deno.Command(acharNavegador(), {
    args: [...FLAGS, `--remote-debugging-port=${porta}`, `--user-data-dir=${perfil}`, url],
    stdout: 'null',
    stderr: 'null',
  }).spawn();

  return {
    perfil,

    /**
     * Fecha o navegador e apaga o perfil.
     *
     * Receber o cliente CDP importa: o jeito confiável de derrubar o
     * navegador é pedir para ele mesmo se fechar (`Browser.close`), que
     * encerra todos os processos filhos e solta os arquivos do perfil.
     * Matar pelo PID não basta, porque o Edge relança a si próprio — o
     * processo que o Deno conhece morre em seguida ao início, e o
     * navegador de verdade fica rodando com outro PID.
     *
     * @param {Object} [cdp] cliente devolvido por `conectar`
     */
    async encerrar(cdp) {
      if (cdp) {
        try {
          await cdp.enviar('Browser.close');
        } catch {
          /* já pode ter caído */
        }
        try {
          cdp.fechar();
        } catch {
          /* websocket já fechado */
        }
      }

      await matarArvore(processo);
      await processo.status;
      await apagarComInsistencia(perfil);
    },
  };
}

/**
 * Encerra o navegador **e os processos filhos dele**.
 *
 * O navegador dos testes é o Edge (ou o Chrome, se o Edge não estiver
 * instalado). Os dois são feitos sobre o Chromium, que se divide em
 * vários processos: renderizador, GPU, crashpad. Matar só o processo pai
 * deixa os filhos vivos por alguns instantes, e enquanto eles existem
 * seguram arquivos abertos dentro do perfil — o que faz a remoção da
 * pasta falhar em silêncio. No Windows, `taskkill /T` derruba a árvore
 * inteira de uma vez.
 *
 * @param {Deno.ChildProcess} processo
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
      /* sem taskkill, cai no kill comum abaixo */
    }
  }
  try {
    processo.kill();
  } catch {
    /* já encerrou sozinho */
  }
}

/**
 * Apaga a pasta do perfil, insistindo enquanto o sistema ainda a segura.
 *
 * Falhar em limpar não pode derrubar o resultado do teste, então o erro
 * final vira um aviso e não uma exceção.
 *
 * @param {string} caminho
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
 * Servidor de arquivos estáticos para o teste, igual ao servir.ps1 mas
 * embutido, para o teste rodar com um comando só.
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
    // Página em branco do mesmo domínio: usada pelo teste de migração, que
    // precisa mexer no banco *antes* de o app abrir a conexão.
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
