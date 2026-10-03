/**
 * Modelos de treino: leitura e edição.
 * Editar um modelo não muda sessões antigas (elas guardam uma cópia).
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

/** Cores para treinos novos. */
const CORES = ['#4f8cff', '#2fbf71', '#ffb454', '#c678dd', '#56b6c2', '#e06c75'];

/* --- Leitura --- */

/**
 * Treinos separados em rotação e extras.
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
 * Treino com o mapa de exercícios.
 * @returns {Promise<{treino: Object, exercicios: Map<string, Object>}|null>}
 */
export async function buscarTreinoDetalhado(id) {
  const [treino, exercicios] = await Promise.all([buscarTreino(id), mapaExercicios()]);
  if (!treino) return null;
  return { treino, exercicios };
}

/** Nome do item: o exercício ou o grupo de alternativas. */
export function nomeDoItem(item, exercicios) {
  if (item.tipo === 'alternativas') {
    if (item.nome) return item.nome;
    const nomes = (item.alternativas ?? []).map((id) => exercicios.get(id)?.nome ?? '?');
    return nomes.join(' ou ');
  }
  return exercicios.get(item.exercicioId)?.nome ?? 'Exercício removido';
}

/* --- Edição do treino --- */

/** Cria um treino vazio no fim do grupo. */
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

/** Grava o treino (nome, cor). */
export function salvar(treino) {
  return salvarTreino(treino);
}

/** Exclui o treino. Sessões já registradas continuam. */
export async function excluirTreino(treinoId) {
  await removerTreino(treinoId);
  const restantes = await listarTreinos();
  await salvarTreinos(numerarOrdem(restantes));
}

/**
 * Sobe (-1) ou desce (1) o treino no grupo.
 * @returns {Promise<boolean>} false se já estava na ponta
 */
export async function moverTreinoNaLista(treinoId, direcao) {
  const todos = await listarTreinos();
  const novos = moverTreino(todos, treinoId, direcao);
  if (!novos) return false;
  await salvarTreinos(novos);
  return true;
}

/** Passa o treino entre rotação e extras. */
export async function alternarNaRotacao(treinoId) {
  const todos = await listarTreinos();
  await salvarTreinos(alternarRotacao(todos, treinoId));
}

/* --- Edição dos itens --- */

/** Acrescenta um exercício no fim do treino. */
export async function adicionarItem(treino, exercicioId) {
  const item = criarItemExercicio({ id: novoId('it'), exercicioId });
  const atualizado = { ...treino, itens: [...treino.itens, item] };
  await salvarTreino(atualizado);
  return atualizado;
}

export async function removerItem(treino, itemId) {
  const atualizado = { ...treino, itens: treino.itens.filter((i) => i.id !== itemId) };
  await salvarTreino(atualizado);
  return atualizado;
}

/** Sobe (-1) ou desce (1) um item. */
export async function moverItem(treino, itemId, direcao) {
  const atualizado = moverItemDoTreino(treino, itemId, direcao);
  if (!atualizado) return treino;
  await salvarTreino(atualizado);
  return atualizado;
}

/** Altera campos de um item (séries, reps, opcional, nome, padrão). */
export async function alterarItem(treino, itemId, mudancas) {
  const itens = treino.itens.map((i) => (i.id === itemId ? { ...i, ...mudancas } : i));
  const atualizado = { ...treino, itens };
  await salvarTreino(atualizado);
  return atualizado;
}

/** Transforma o item num grupo de alternativas. */
export async function criarGrupo(treino, itemId, outroExercicioId, nome) {
  const itens = treino.itens.map((i) =>
    i.id === itemId ? virarGrupoDeAlternativas(i, outroExercicioId, nome) : i
  );
  const atualizado = { ...treino, itens };
  await salvarTreino(atualizado);
  return atualizado;
}

/** Acrescenta uma alternativa ao grupo. */
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

/** Tira uma alternativa (sobrando uma, vira item simples). */
export async function tirarAlternativa(treino, itemId, exercicioId) {
  const itens = treino.itens.map((i) =>
    i.id === itemId ? removerAlternativa(i, exercicioId) : i
  );
  const atualizado = { ...treino, itens };
  await salvarTreino(atualizado);
  return atualizado;
}

/** Desfaz o grupo, ficando a alternativa padrão. */
export async function desfazerGrupoDeAlternativas(treino, itemId) {
  const itens = treino.itens.map((i) => (i.id === itemId ? desfazerGrupo(i) : i));
  const atualizado = { ...treino, itens };
  await salvarTreino(atualizado);
  return atualizado;
}

export { listarTreinos, listarRotacao, listarMusculos, CORES };
