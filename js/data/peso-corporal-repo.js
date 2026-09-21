/**
 * Repositório do peso corporal registrado.
 * Usado para calcular a carga efetiva de exercícios de peso corporal e
 * assistidos: sempre o peso mais recente até a data da sessão.
 */
import { lerTudo, ler, gravar, apagar } from './db.js';

const STORE = 'pesoCorporal';

/**
 * Lista os registros de peso, do mais recente para o mais antigo.
 * @returns {Promise<Object[]>}
 */
export async function listarPesos() {
  const itens = await lerTudo(STORE);
  return itens.sort((a, b) => b.data.localeCompare(a.data));
}

/**
 * Busca um registro pelo ID.
 * @param {string} id
 * @returns {Promise<Object|undefined>}
 */
export function buscarPeso(id) {
  return ler(STORE, id);
}

/**
 * Cria ou atualiza um registro de peso.
 * @param {{id: string, data: string, kg: number}} peso
 * @returns {Promise<void>}
 */
export async function salvarPeso(peso) {
  await gravar(STORE, peso);
}

/**
 * Remove um registro de peso.
 * @param {string} id
 * @returns {Promise<void>}
 */
export function removerPeso(id) {
  return apagar(STORE, id);
}
