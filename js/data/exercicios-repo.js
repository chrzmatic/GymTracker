/**
 * Repositório de exercícios.
 * Cada exercício tem ID fixo, nome, tipo de carga e a lista de músculos
 * trabalhados (direto ou indireto, com fração).
 */
import { lerTudo, ler, gravar, apagar, gravarVarios, contar } from './db.js';
import { TIPOS_CARGA, ROTULO_CARGA } from '../utils/constantes.js';

const STORE = 'exercicios';

export { TIPOS_CARGA, ROTULO_CARGA };

/**
 * Lista todos os exercícios em ordem alfabética.
 * @returns {Promise<Object[]>}
 */
export async function listarExercicios() {
  const itens = await lerTudo(STORE);
  return itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Busca um exercício pelo ID.
 * @param {string} id
 * @returns {Promise<Object|undefined>}
 */
export function buscarExercicio(id) {
  return ler(STORE, id);
}

/**
 * Cria ou atualiza um exercício. Renomear não altera o ID.
 * @param {Object} exercicio
 * @returns {Promise<void>}
 */
export async function salvarExercicio(exercicio) {
  await gravar(STORE, exercicio);
}

/**
 * Remove um exercício.
 * @param {string} id
 * @returns {Promise<void>}
 */
export function removerExercicio(id) {
  return apagar(STORE, id);
}

/**
 * Grava vários exercícios (carga inicial).
 * @param {Object[]} exercicios
 * @returns {Promise<void>}
 */
export function salvarExercicios(exercicios) {
  return gravarVarios(STORE, exercicios);
}

/**
 * Quantidade de exercícios cadastrados.
 * @returns {Promise<number>}
 */
export function contarExercicios() {
  return contar(STORE);
}

/**
 * Monta um mapa id -> exercício, prático para as views e o domínio.
 * @returns {Promise<Map<string, Object>>}
 */
export async function mapaExercicios() {
  const itens = await listarExercicios();
  return new Map(itens.map((e) => [e.id, e]));
}
