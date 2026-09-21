/**
 * Repositório de músculos.
 * Lista editável de grupos musculares usada pelo contador de séries semanais.
 */
import { lerTudo, ler, gravar, apagar, gravarVarios, contar } from './db.js';

const STORE = 'musculos';

/**
 * Lista todos os músculos em ordem alfabética estável.
 * @returns {Promise<Object[]>}
 */
export async function listarMusculos() {
  const itens = await lerTudo(STORE);
  return itens.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Busca um músculo pelo ID.
 * @param {string} id
 * @returns {Promise<Object|undefined>}
 */
export function buscarMusculo(id) {
  return ler(STORE, id);
}

/**
 * Cria ou atualiza um músculo.
 * @param {{id: string, nome: string, ordem?: number}} musculo
 * @returns {Promise<void>}
 */
export async function salvarMusculo(musculo) {
  await gravar(STORE, musculo);
}

/**
 * Remove um músculo.
 * @param {string} id
 * @returns {Promise<void>}
 */
export function removerMusculo(id) {
  return apagar(STORE, id);
}

/**
 * Grava vários músculos de uma vez (usado pela carga inicial).
 * @param {Object[]} musculos
 * @returns {Promise<void>}
 */
export function salvarMusculos(musculos) {
  return gravarVarios(STORE, musculos);
}

/**
 * Quantidade de músculos cadastrados.
 * @returns {Promise<number>}
 */
export function contarMusculos() {
  return contar(STORE);
}
