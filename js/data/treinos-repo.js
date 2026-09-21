/**
 * Repositório de modelos de treino (A, B, C, extras...).
 * O modelo guarda a lista ordenada de itens; editar um modelo nunca altera
 * sessões antigas, porque a sessão guarda uma cópia do modelo.
 */
import { lerTudo, ler, gravar, apagar, gravarVarios, contar } from './db.js';

const STORE = 'treinos';

/**
 * Lista todos os treinos na ordem definida pelo usuário.
 * @returns {Promise<Object[]>}
 */
export async function listarTreinos() {
  const itens = await lerTudo(STORE);
  return itens.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
}

/**
 * Lista apenas os treinos da rotação, na ordem — essa é a sequência seguida
 * pela sugestão do próximo treino.
 * @returns {Promise<Object[]>}
 */
export async function listarRotacao() {
  const itens = await listarTreinos();
  return itens.filter((t) => t.naRotacao);
}

/**
 * Busca um treino pelo ID.
 * @param {string} id
 * @returns {Promise<Object|undefined>}
 */
export function buscarTreino(id) {
  return ler(STORE, id);
}

/**
 * Cria ou atualiza um treino.
 * @param {Object} treino
 * @returns {Promise<void>}
 */
export async function salvarTreino(treino) {
  await gravar(STORE, treino);
}

/**
 * Remove um treino. Sessões antigas continuam intactas.
 * @param {string} id
 * @returns {Promise<void>}
 */
export function removerTreino(id) {
  return apagar(STORE, id);
}

/**
 * Grava vários treinos (carga inicial).
 * @param {Object[]} treinos
 * @returns {Promise<void>}
 */
export function salvarTreinos(treinos) {
  return gravarVarios(STORE, treinos);
}

/**
 * Quantidade de treinos cadastrados.
 * @returns {Promise<number>}
 */
export function contarTreinos() {
  return contar(STORE);
}
