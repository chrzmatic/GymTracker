/**
 * Navegação: abas embaixo e uma pilha de telas em cada aba.
 *
 * `abrir()` empilha uma tela; o "voltar" desempilha. Cada aba guarda a
 * sua pilha, e tudo (aba, pilhas e rolagem) vai para o localStorage,
 * porque o iPhone descarta o app em segundo plano.
 */

/**
 * Telas do app. Cada uma carrega sob demanda.
 * @type {Object<string, {titulo: string, carregar: () => Promise<Function>}>}
 */
const TELAS = {
  treino: {
    titulo: 'Treino',
    carregar: () => import('./views/treino-view.js').then((m) => m.montarTreino),
  },
  treinos: {
    titulo: 'Treinos',
    carregar: () => import('./views/treinos-view.js').then((m) => m.montarTreinos),
  },
  'treino-editor': {
    titulo: 'Editar treino',
    carregar: () => import('./views/treino-editor-view.js').then((m) => m.montarEditor),
  },
  exercicios: {
    titulo: 'Exercícios',
    carregar: () => import('./views/exercicios-view.js').then((m) => m.montarExercicios),
  },
  'exercicio-editor': {
    titulo: 'Editar exercício',
    carregar: () => import('./views/exercicios-view.js').then((m) => m.montarEditorDeExercicio),
  },
  musculos: {
    titulo: 'Músculos',
    carregar: () => import('./views/musculos-view.js').then((m) => m.montarMusculos),
  },
  historico: {
    titulo: 'Histórico',
    carregar: () => import('./views/historico-view.js').then((m) => m.montarHistorico),
  },
  'sessao-resumo': {
    titulo: 'Treino',
    carregar: () =>
      import('./views/sessao-resumo-view.js').then((m) => m.montarResumoDaSessao),
  },
  calendario: {
    titulo: 'Calendário',
    carregar: () => import('./views/calendario-view.js').then((m) => m.montarCalendario),
  },
  configuracoes: {
    titulo: 'Configurações',
    carregar: () =>
      import('./views/configuracoes-view.js').then((m) => m.montarConfiguracoes),
  },
  peso: {
    titulo: 'Peso corporal',
    carregar: () => import('./views/peso-view.js').then((m) => m.montarPeso),
  },
  dropbox: {
    titulo: 'Backup no Dropbox',
    carregar: () => import('./views/dropbox-view.js').then((m) => m.montarDropbox),
  },
  comparar: {
    titulo: 'Comparar',
    carregar: () => import('./views/comparar-view.js').then((m) => m.montarComparar),
  },
  progresso: {
    titulo: 'Progresso',
    carregar: () => import('./views/progresso-view.js').then((m) => m.montarProgresso),
  },
  dieta: {
    titulo: 'Dieta',
    carregar: () => import('./views/dieta-view.js').then((m) => m.montarDieta),
  },
  alimentos: {
    titulo: 'Alimentos',
    carregar: () => import('./views/alimentos-view.js').then((m) => m.montarAlimentos),
  },
  'alimento-editor': {
    titulo: 'Alimento',
    carregar: () =>
      import('./views/alimentos-view.js').then((m) => m.montarEditorDeAlimento),
  },
  pratos: {
    titulo: 'Pratos compostos',
    carregar: () => import('./views/pratos-view.js').then((m) => m.montarPratos),
  },
  'prato-editor': {
    titulo: 'Prato',
    carregar: () => import('./views/pratos-view.js').then((m) => m.montarEditorDePrato),
  },
  refeicao: {
    titulo: 'Refeição',
    carregar: () =>
      import('./views/refeicoes-view.js').then((m) => m.montarEditorDeRefeicao),
  },
  'plano-editor': {
    titulo: 'Editar plano',
    carregar: () => import('./views/refeicoes-view.js').then((m) => m.montarEditorDePlano),
  },
  nutricional: {
    titulo: 'Informação nutricional',
    carregar: () => import('./views/nutricional-view.js').then((m) => m.montarNutricional),
  },
};

/** Pilha de telas por aba. A posição 0 é a raiz da aba. */
const pilhas = new Map();

let abaAtual = null;
let aoTrocarDeAba = () => {};

/** Chave do localStorage com o estado da navegação. */
const CHAVE_ESTADO = 'gymtracker:navegacao';

/**
 * Trava durante o desenho: esvaziar a tela dispara um `scroll` para o topo
 * que apagaria a posição guardada.
 */
let desenhando = false;

/** Grava o estado da navegação. */
function salvarEstado() {
  if (!abaAtual) return;
  try {
    localStorage.setItem(
      CHAVE_ESTADO,
      JSON.stringify({ aba: abaAtual, pilhas: Object.fromEntries(pilhas) })
    );
  } catch {
    /* localStorage bloqueado (modo privado): não é crítico. */
  }
}

/**
 * Lê o estado guardado, descartando telas que não existem mais.
 * @returns {string|null} a aba que estava aberta
 */
function lerEstado() {
  let bruto = null;
  try {
    bruto = localStorage.getItem(CHAVE_ESTADO);
  } catch {
    return null;
  }
  if (!bruto) return null;

  try {
    const estado = JSON.parse(bruto);
    if (!estado || typeof estado !== 'object') return null;

    Object.entries(estado.pilhas ?? {}).forEach(([aba, itens]) => {
      if (!Array.isArray(itens) || !itens.length) return;
      const limpa = itens.filter(
        (e) => e && typeof e === 'object' && typeof e.tela === 'string' && TELAS[e.tela]
      );
      // A raiz tem que ser a própria aba.
      if (!limpa.length || limpa[0].tela !== aba) return;
      pilhas.set(
        aba,
        limpa.map((e) => ({
          tela: e.tela,
          params: e.params && typeof e.params === 'object' ? e.params : {},
          rolagem: Number.isFinite(e.rolagem) ? e.rolagem : 0,
        }))
      );
    });

    return typeof estado.aba === 'string' ? estado.aba : null;
  } catch {
    return null;
  }
}

/** A tela à vista. */
function topo() {
  const p = pilha();
  return p[p.length - 1];
}

/** Deixa só a raiz da aba (quando a tela guardada não abre mais). */
export function voltarParaRaiz(abaId) {
  pilhas.set(abaId, [{ tela: abaId, params: {}, rolagem: 0 }]);
  salvarEstado();
}

/**
 * Liga a navegação à página e lê o estado guardado.
 * @param {(abaId: string) => void} callbackAba marca a aba ativa
 * @returns {string|null} a aba que estava aberta
 */
export function iniciarNavegacao(callbackAba) {
  aoTrocarDeAba = callbackAba;
  const voltar = document.getElementById('btn-voltar');
  voltar.onclick = () => voltarUmaTela();

  // A restauração de rolagem do navegador briga com a nossa.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  // Anota a rolagem enquanto rola: o app pode ser descartado sem aviso.
  let agendado = 0;
  addEventListener(
    'scroll',
    () => {
      if (desenhando || !abaAtual) return;
      topo().rolagem = window.scrollY;
      if (agendado) return;
      agendado = setTimeout(() => {
        agendado = 0;
        salvarEstado();
      }, 300);
    },
    { passive: true }
  );

  // `pagehide` é o último evento garantido no Safari; `visibilitychange`
  // cobre a troca de app.
  const guardar = () => {
    if (abaAtual) topo().rolagem = window.scrollY;
    salvarEstado();
  };
  addEventListener('pagehide', guardar);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') guardar();
  });

  return lerEstado();
}

/** Pilha da aba atual (criada na primeira visita). */
function pilha() {
  if (!pilhas.has(abaAtual)) {
    pilhas.set(abaAtual, [{ tela: abaAtual, params: {}, rolagem: 0 }]);
  }
  return pilhas.get(abaAtual);
}

/** Abre uma aba, voltando à tela em que você estava nela. */
export async function irParaAba(abaId) {
  anotarRolagem();
  abaAtual = abaId;
  aoTrocarDeAba(abaId);
  await desenhar();
}

/**
 * Empilha uma tela.
 * @param {string} telaId
 * @param {Object} [params] repassado para a tela
 */
export async function abrir(telaId, params = {}) {
  anotarRolagem();
  pilha().push({ tela: telaId, params, rolagem: 0 });
  await desenhar();
}

/** Troca a tela do topo sem empilhar. */
export async function trocar(telaId, params = {}) {
  const p = pilha();
  p[p.length - 1] = { tela: telaId, params, rolagem: 0 };
  await desenhar();
}

/** Volta uma tela. Na raiz, não faz nada. */
export async function voltarUmaTela() {
  const p = pilha();
  if (p.length <= 1) return;
  p.pop();
  await desenhar();
}

/** Guarda a rolagem da tela atual. */
function anotarRolagem() {
  if (abaAtual) topo().rolagem = window.scrollY;
}

/** Redesenha a tela atual com os dados do banco. */
export async function recarregar() {
  if (!abaAtual) return;
  // Redesenhar mantém a rolagem.
  anotarRolagem();
  await desenhar();
}

/**
 * Descarta todas as pilhas e abre uma aba do zero.
 * Usado depois de restaurar backup ou apagar tudo, sem recarregar a página.
 */
export async function recomecar(abaId = 'treino') {
  pilhas.clear();
  abaAtual = null;
  await irParaAba(abaId);
}

/** Troca o título do cabeçalho. */
export function definirTitulo(texto) {
  document.getElementById('titulo').textContent = texto;
}

/** Desenha a tela do topo da pilha. */
async function desenhar() {
  const p = pilha();
  const atual = p[p.length - 1];
  const tela = TELAS[atual.tela];

  const btnVoltar = document.getElementById('btn-voltar');
  btnVoltar.hidden = p.length <= 1;

  const destino = document.getElementById('conteudo');
  desenhando = true;
  destino.innerHTML = '';

  try {
    if (!tela) {
      definirTitulo(atual.tela);
      destino.innerHTML = '<div class="vazio">Tela não encontrada.</div>';
      return;
    }

    definirTitulo(tela.titulo);
    const montar = await tela.carregar();
    await montar(destino, atual.params);
    devolverRolagem(atual.rolagem ?? 0);
  } finally {
    // Solta a trava no quadro seguinte, depois do `scroll` do navegador.
    requestAnimationFrame(() => {
      desenhando = false;
    });
    salvarEstado();
  }
}

/** Devolve a rolagem. Repete no quadro seguinte, quando a página já tem a altura final. */
function devolverRolagem(y) {
  window.scrollTo(0, y);
  if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y));
}
