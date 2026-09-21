/**
 * Casos de uso dos modelos de treino: leitura para as telas e edição
 * completa (criar, renomear, reordenar, mexer nos itens).
 *
 * Editar um modelo nunca altera sessões antigas — a sessão guarda uma cópia
 * congelada do treino do dia em que foi feita.
 */

import {
  listarTreinos,
  listarRotacao,
  buscarTreino,
  salvarTreino,
  salvarTreinos,
  removerTreino,
} from '../data/treinos-repo.js';
import { mapaExercicios } from '../data/exercicios-repo.js';
import { listarMusculos } from '../data/musculos-repo.js';
import { novoId } from '../utils/id.js';
import {
  moverItemDoTreino,
  moverTreino,
  alternarRotacao,
  numerarOrdem,
  criarItemExercicio,
  virarGrupoDeAlternativas,
  desfazerGrupo,
  removerAlternativa,
} from '../domain/treino.js';

/** Cores sugeridas para treinos novos, usadas no calendário da Etapa 3. */
const CORES = ['#4f8cff', '#2fbf71', '#ffb454', '#c678dd', '#56b6c2', '#e06c75'];

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

/**
 * Lista os treinos separados em rotação e extras.
 * @returns {Promise<{rotacao: Object[], extras: Object[], todos: Object[]}>}
 */
export async function listarTreinosAgrupados() {
  const todos = await listarTreinos();
  return {
    todos,
    rotacao: todos.filter((t) => t.naRotacao),
    extras: todos.filter((t) => !t.naRotacao),
  };
}

/**
 * Busca um treino com o mapa de exercícios já resolvido.
 * @param {string} id
 * @returns {Promise<{treino: Object, exercicios: Map<string, Object>}|null>}
 */
export async function buscarTreinoDetalhado(id) {
  const [treino, exercicios] = await Promise.all([buscarTreino(id), mapaExercicios()]);
  if (!treino) return null;
  return { treino, exercicios };
}

/**
 * Nome de exibição de um item de treino (exercício ou grupo de alternativas).
 * @param {Object} item
 * @param {Map<string, Object>} exercicios
 * @returns {string}
 */
export function nomeDoItem(item, exercicios) {
  if (item.tipo === 'alternativas') {
    if (item.nome) return item.nome;
    const nomes = (item.alternativas ?? []).map((id) => exercicios.get(id)?.nome ?? '?');
    return nomes.join(' ou ');
  }
  return exercicios.get(item.exercicioId)?.nome ?? 'Exercício removido';
}

/* ------------------------------------------------------------------ */
/* Edição do treino                                                    */
/* ------------------------------------------------------------------ */

/**
 * Cria um treino vazio, no fim do grupo escolhido.
 * @param {string} nome
 * @param {boolean} [naRotacao]
 * @returns {Promise<Object>} o treino criado
 */
export async function criarTreino(nome, naRotacao = true) {
  const todos = await listarTreinos();
  const treino = {
    id: novoId('tr'),
    nome: nome.trim(),
    naRotacao,
    ordem: todos.length,
    cor: CORES[todos.length % CORES.length],
    itens: [],
  };
  await salvarTreinos(numerarOrdem([...todos, treino]));
  return treino;
}

/**
 * Grava alterações soltas do treino (nome, cor).
 * @param {Object} treino
 * @returns {Promise<void>}
 */
export function salvar(treino) {
  return salvarTreino(treino);
}

/**
 * Exclui um treino. As sessões já registradas continuam intactas.
 * @param {string} treinoId
 * @returns {Promise<void>}
 */
export async function excluirTreino(treinoId) {
  await removerTreino(treinoId);
  const restantes = await listarTreinos();
  await salvarTreinos(numerarOrdem(restantes));
}

/**
 * Sobe ou desce um treino dentro do próprio grupo.
 * @param {string} treinoId
 * @param {-1|1} direcao
 * @returns {Promise<boolean>} false se já estava na ponta
 */
export async function moverTreinoNaLista(treinoId, direcao) {
  const todos = await listarTreinos();
  const novos = moverTreino(todos, treinoId, direcao);
  if (!novos) return false;
  await salvarTreinos(novos);
  return true;
}

/**
 * Move um treino entre rotação e extras.
 * @param {string} treinoId
 * @returns {Promise<void>}
 */
export async function alternarNaRotacao(treinoId) {
  const todos = await listarTreinos();
  await salvarTreinos(alternarRotacao(todos, treinoId));
}

/* ------------------------------------------------------------------ */
/* Edição dos itens                                                    */
/* ------------------------------------------------------------------ */

/**
 * Acrescenta um exercício ao fim do treino.
 * @param {Object} treino
 * @param {string} exercicioId
 * @returns {Promise<Object>} treino atualizado
 */
export async function adicionarItem(treino, exercicioId) {
  const item = criarItemExercicio({ id: novoId('it'), exercicioId });
  const atualizado = { ...treino, itens: [...treino.itens, item] };
  await salvarTreino(atualizado);
  return atualizado;
}

/**
 * Remove um item do treino.
 * @param {Object} treino
 * @param {string} itemId
 * @returns {Promise<Object>} treino atualizado
 */
export async function removerItem(treino, itemId) {
  const atualizado = { ...treino, itens: treino.itens.filter((i) => i.id !== itemId) };
  await salvarTreino(atualizado);
  return atualizado;
}

/**
 * Sobe ou desce um item dentro do treino.
 * @param {Object} treino
 * @param {string} itemId
 * @param {-1|1} direcao
 * @returns {Promise<Object>} treino atualizado (o mesmo, se não deu para mover)
 */
export async function moverItem(treino, itemId, direcao) {
  const atualizado = moverItemDoTreino(treino, itemId, direcao);
  if (!atualizado) return treino;
  await salvarTreino(atualizado);
  return atualizado;
}

/**
 * Altera campos de um item (séries, reps, opcional, nome do grupo, padrão).
 * @param {Object} treino
 * @param {string} itemId
 * @param {Object} mudancas
 * @returns {Promise<Object>} treino atualizado
 */
export async function alterarItem(treino, itemId, mudancas) {
  const itens = treino.itens.map((i) => (i.id === itemId ? { ...i, ...mudancas } : i));
  const atualizado = { ...treino, itens };
  await salvarTreino(atualizado);
  return atualizado;
}

/**
 * Transforma um item de exercício num grupo de alternativas.
 * @param {Object} treino
 * @param {string} itemId
 * @param {string} outroExercicioId
 * @param {string} [nome]
 * @returns {Promise<Object>} treino atualizado
 */
export async function criarGrupo(treino, itemId, outroExercicioId, nome) {
  const itens = treino.itens.map((i) =>
    i.id === itemId ? virarGrupoDeAlternativas(i, outroExercicioId, nome) : i
  );
  const atualizado = { ...treino, itens };
  await salvarTreino(atualizado);
  return atualizado;
}

/**
 * Acrescenta uma alternativa a um grupo já existente.
 * @param {Object} treino
 * @param {string} itemId
 * @param {string} exercicioId
 * @returns {Promise<Object>} treino atualizado
 */
export async function adicionarAlternativa(treino, itemId, exercicioId) {
  const itens = treino.itens.map((i) =>
    i.id === itemId && !i.alternativas.includes(exercicioId)
      ? { ...i, alternativas: [...i.alternativas, exercicioId] }
      : i
  );
  const atualizado = { ...treino, itens };
  await salvarTreino(atualizado);
  return atualizado;
}

/**
 * Tira uma alternativa do grupo (virando item simples se sobrar uma só).
 * @param {Object} treino
 * @param {string} itemId
 * @param {string} exercicioId
 * @returns {Promise<Object>} treino atualizado
 */
export async function tirarAlternativa(treino, itemId, exercicioId) {
  const itens = treino.itens.map((i) =>
    i.id === itemId ? removerAlternativa(i, exercicioId) : i
  );
  const atualizado = { ...treino, itens };
  await salvarTreino(atualizado);
  return atualizado;
}

/**
 * Desfaz o grupo, mantendo só a alternativa padrão.
 * @param {Object} treino
 * @param {string} itemId
 * @returns {Promise<Object>} treino atualizado
 */
export async function desfazerGrupoDeAlternativas(treino, itemId) {
  const itens = treino.itens.map((i) => (i.id === itemId ? desfazerGrupo(i) : i));
  const atualizado = { ...treino, itens };
  await salvarTreino(atualizado);
  return atualizado;
}

export { listarTreinos, listarRotacao, listarMusculos, CORES };
