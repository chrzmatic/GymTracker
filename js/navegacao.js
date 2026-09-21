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

/**
 * Liga a navegação aos elementos da página.
 * @param {(abaId: string) => void} callbackAba chamado para marcar a aba ativa
 */
export function iniciarNavegacao(callbackAba) {
  aoTrocarDeAba = callbackAba;
  const voltar = document.getElementById('btn-voltar');
  voltar.onclick = () => voltarUmaTela();
}

/** Pilha da aba atual, criada na primeira visita. */
function pilha() {
  if (!pilhas.has(abaAtual)) pilhas.set(abaAtual, [{ tela: abaAtual, params: {} }]);
  return pilhas.get(abaAtual);
}

/**
 * Abre uma aba. Volta para onde você estava nela, se já tinha entrado antes.
 * @param {string} abaId
 * @returns {Promise<void>}
 */
export async function irParaAba(abaId) {
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
  pilha().push({ tela: telaId, params });
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
  p[p.length - 1] = { tela: telaId, params };
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

/**
 * Redesenha a tela atual, relendo o banco.
 * Usada depois de gravar algo, e ao voltar do segundo plano.
 * @returns {Promise<void>}
 */
export async function recarregar() {
  if (abaAtual) await desenhar();
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
  destino.innerHTML = '';

  if (!tela) {
    definirTitulo(atual.tela);
    destino.innerHTML = '<div class="vazio">Esta tela chega numa próxima etapa.</div>';
    return;
  }

  definirTitulo(tela.titulo);
  const montar = await tela.carregar();
  await montar(destino, atual.params);
  window.scrollTo(0, 0);
}
