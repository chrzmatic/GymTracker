/**
 * Navegação do app: abas embaixo e uma pilha de sub-telas por cima.
 *
 * As 5 abas da especificação (Treino, Calendário, Comparar, Progresso,
 * Dieta) não dão conta sozinhas: editar um treino, mexer nos exercícios ou
 * abrir o histórico são telas que nascem de dentro de uma aba e precisam de
 * um "voltar". Então cada aba tem uma pilha própria: a raiz é a tela da aba,
 * e `abrir()` empilha por cima.
 *
 * Trocar de aba não perde onde você estava na outra — a pilha de cada aba
 * fica guardada, o que importa quando você sai para conferir uma coisa e
 * volta no meio de um treino.
 *
 * Sair do app também não perde: a aba, a pilha de cada aba e a posição da
 * rolagem de cada tela vão para o `localStorage`. No iPhone o app da Tela
 * de Início é descartado da memória a qualquer momento, então voltar para
 * ele é quase sempre uma abertura do zero — sem isso, cada ida ao WhatsApp
 * no meio do treino devolvia você ao topo da primeira aba.
 */

/**
 * Telas disponíveis. Cada uma carrega sob demanda, então uma tela quebrada
 * ou ainda não escrita não impede o app de abrir.
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
    carregar: () => import('./views/dieta-editor-view.js').then((m) => m.montarAlimentos),
  },
  'alimento-editor': {
    titulo: 'Alimento',
    carregar: () =>
      import('./views/dieta-editor-view.js').then((m) => m.montarEditorDeAlimento),
  },
  pratos: {
    titulo: 'Pratos compostos',
    carregar: () => import('./views/dieta-editor-view.js').then((m) => m.montarPratos),
  },
  'prato-editor': {
    titulo: 'Prato',
    carregar: () => import('./views/dieta-editor-view.js').then((m) => m.montarEditorDePrato),
  },
  refeicao: {
    titulo: 'Refeição',
    carregar: () =>
      import('./views/dieta-editor-view.js').then((m) => m.montarEditorDeRefeicao),
  },
  'plano-editor': {
    titulo: 'Editar plano',
    carregar: () => import('./views/dieta-editor-view.js').then((m) => m.montarEditorDePlano),
  },
  nutricional: {
    titulo: 'Informação nutricional',
    carregar: () => import('./views/dieta-editor-view.js').then((m) => m.montarNutricional),
  },
};

/** Pilha de telas por aba. A posição 0 é sempre a tela raiz da aba. */
const pilhas = new Map();

let abaAtual = null;
let aoTrocarDeAba = () => {};

/** Onde a navegação inteira (aba, pilhas e rolagem) fica guardada. */
const CHAVE_ESTADO = 'gymtracker:navegacao';

/**
 * Enquanto uma tela é desenhada o conteúdo é esvaziado, a página encolhe e
 * o navegador dispara um `scroll` para o topo. Sem esta trava, esse zero
 * apagaria justamente a posição que estamos tentando devolver.
 */
let desenhando = false;

/** Grava o estado da navegação, para o app voltar onde estava. */
function salvarEstado() {
  if (!abaAtual) return;
  try {
    localStorage.setItem(
      CHAVE_ESTADO,
      JSON.stringify({ aba: abaAtual, pilhas: Object.fromEntries(pilhas) })
    );
  } catch {
    /* modo privado pode bloquear o localStorage; não é crítico */
  }
}

/**
 * Lê o estado guardado na última vez que o app foi usado.
 *
 * Só aceita o que ainda faz sentido: telas que existem e entradas com a
 * forma esperada. Uma versão nova do app pode ter perdido uma tela que
 * estava na pilha, e aí é melhor cair na raiz da aba do que quebrar na
 * abertura.
 *
 * @returns {string|null} a aba que estava aberta, ou null
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
      // A raiz tem que ser a própria aba; se não for, a pilha veio torta.
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

/** A entrada do topo da pilha atual: a tela que está à vista. */
function topo() {
  const p = pilha();
  return p[p.length - 1];
}

/**
 * Descarta a pilha de uma aba, deixando só a tela raiz.
 *
 * É a rede de segurança da restauração: se a tela guardada não conseguir
 * montar — um treino que foi apagado, uma sessão que sumiu num backup
 * restaurado — o app abre na raiz da aba em vez de num erro.
 *
 * @param {string} abaId
 */
export function voltarParaRaiz(abaId) {
  pilhas.set(abaId, [{ tela: abaId, params: {}, rolagem: 0 }]);
  salvarEstado();
}

/**
 * Liga a navegação aos elementos da página e recupera o estado guardado.
 * @param {(abaId: string) => void} callbackAba chamado para marcar a aba ativa
 * @returns {string|null} a aba que estava aberta da última vez
 */
export function iniciarNavegacao(callbackAba) {
  aoTrocarDeAba = callbackAba;
  const voltar = document.getElementById('btn-voltar');
  voltar.onclick = () => voltarUmaTela();

  // O navegador tem uma restauração de rolagem própria, que briga com a
  // nossa: ele devolve a posição antes de a tela ser remontada, quando a
  // página ainda não tem altura, e o resultado é sempre o topo.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  // Anota a rolagem enquanto você rola, e não só ao trocar de tela: o app
  // pode ser descartado sem aviso nenhum.
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

  // `pagehide` é o último momento garantido no Safari do iPhone;
  // `beforeunload` não é confiável lá, e `visibilitychange` cobre o caso
  // de você só trocar de app sem fechar nada.
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

/** Pilha da aba atual, criada na primeira visita. */
function pilha() {
  if (!pilhas.has(abaAtual)) {
    pilhas.set(abaAtual, [{ tela: abaAtual, params: {}, rolagem: 0 }]);
  }
  return pilhas.get(abaAtual);
}

/**
 * Abre uma aba. Volta para onde você estava nela, se já tinha entrado antes.
 * @param {string} abaId
 * @returns {Promise<void>}
 */
export async function irParaAba(abaId) {
  anotarRolagem();
  abaAtual = abaId;
  aoTrocarDeAba(abaId);
  await desenhar();
}

/**
 * Empilha uma sub-tela por cima da atual.
 * @param {string} telaId
 * @param {Object} [params] repassado para a view
 * @returns {Promise<void>}
 */
export async function abrir(telaId, params = {}) {
  anotarRolagem();
  pilha().push({ tela: telaId, params, rolagem: 0 });
  await desenhar();
}

/**
 * Troca a tela do topo sem empilhar (para não acumular "voltar" à toa).
 * @param {string} telaId
 * @param {Object} [params]
 * @returns {Promise<void>}
 */
export async function trocar(telaId, params = {}) {
  const p = pilha();
  p[p.length - 1] = { tela: telaId, params, rolagem: 0 };
  await desenhar();
}

/**
 * Volta uma tela. Na raiz da aba, não faz nada.
 * @returns {Promise<void>}
 */
export async function voltarUmaTela() {
  const p = pilha();
  if (p.length <= 1) return;
  p.pop();
  await desenhar();
}

/** Guarda onde a tela atual está rolada, antes de sair dela. */
function anotarRolagem() {
  if (abaAtual) topo().rolagem = window.scrollY;
}

/**
 * Redesenha a tela atual, relendo o banco.
 * Usada depois de gravar algo, e ao voltar do segundo plano.
 * @returns {Promise<void>}
 */
export async function recarregar() {
  if (!abaAtual) return;
  // Redesenhar a mesma tela não é navegar: a posição da rolagem é para
  // ficar onde está. Sem isto, voltar de outro app no meio de uma lista
  // longa jogava você de volta para o topo dela.
  anotarRolagem();
  await desenhar();
}

/**
 * Joga a navegação toda fora e abre uma aba do zero.
 *
 * É o que vem depois de restaurar um backup ou apagar tudo: as telas
 * empilhadas apontam para sessões e treinos que podem não existir mais.
 * Antes isso era resolvido com `location.reload()`, mas recarregar a
 * página logo depois de escrever no banco é justamente o que fazia a
 * importação parecer que não tinha funcionado no iPhone.
 *
 * @param {string} [abaId]
 * @returns {Promise<void>}
 */
export async function recomecar(abaId = 'treino') {
  pilhas.clear();
  abaAtual = null;
  await irParaAba(abaId);
}

/**
 * Troca o título do cabeçalho.
 * Views que mostram algo específico ("Treino A") chamam isso ao montar.
 * @param {string} texto
 */
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
      destino.innerHTML = '<div class="vazio">Esta tela chega numa próxima etapa.</div>';
      return;
    }

    definirTitulo(tela.titulo);
    const montar = await tela.carregar();
    await montar(destino, atual.params);
    devolverRolagem(atual.rolagem ?? 0);
  } finally {
    // Só solta a trava no quadro seguinte: o `scroll` que o navegador
    // dispara por causa da troca de conteúdo chega depois do desenho.
    requestAnimationFrame(() => {
      desenhando = false;
    });
    salvarEstado();
  }
}

/**
 * Devolve a rolagem da tela recém-desenhada.
 *
 * Vai duas vezes de propósito: na hora, e no quadro seguinte. A altura
 * final da página só existe depois do primeiro layout — um gráfico ou uma
 * lista longa ainda não ocupam espaço quando `montar` termina, e o
 * navegador corta o `scrollTo` no fim da página que existia até então.
 *
 * @param {number} y
 */
function devolverRolagem(y) {
  window.scrollTo(0, y);
  if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y));
}
