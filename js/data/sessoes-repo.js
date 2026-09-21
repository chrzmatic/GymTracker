/**
 * Repositório de sessões de treino.
 * A data é sempre uma data local AAAA-MM-DD (ver js/utils/date.js).
 */
import { lerTudo, ler, gravar, apagar, lerPorIndice } from './db.js';
import { STATUS } from '../utils/constantes.js';

const STORE = 'sessoes';

export { STATUS };

/**
 * Lista todas as sessões, da mais recente para a mais antiga.
 * @returns {Promise<Object[]>}
 */
export async function listarSessoes() {
  const itens = await lerTudo(STORE);
  return itens.sort(
    (a, b) => b.data.localeCompare(a.data) || (b.criadaEm ?? 0) - (a.criadaEm ?? 0)
  );
}

/**
 * Lista as sessões de uma data específica.
 * @param {string} data AAAA-MM-DD
 * @returns {Promise<Object[]>}
 */
export async function listarSessoesDaData(data) {
  const itens = await lerPorIndice(STORE, 'data', data);
  return itens.sort((a, b) => (a.criadaEm ?? 0) - (b.criadaEm ?? 0));
}

/**
 * Retorna a sessão em andamento, se houver. Só pode existir uma por vez.
 * @returns {Promise<Object|undefined>}
 */
export async function buscarSessaoEmAndamento() {
  const itens = await lerPorIndice(STORE, 'status', STATUS.EM_ANDAMENTO);
  return itens.sort((a, b) => (b.criadaEm ?? 0) - (a.criadaEm ?? 0))[0];
}

/**
 * Busca uma sessão pelo ID.
 * @param {string} id
 * @returns {Promise<Object|undefined>}
 */
export function buscarSessao(id) {
  return ler(STORE, id);
}

/**
 * Cria ou atualiza uma sessão.
 * @param {Object} sessao
 * @returns {Promise<void>}
 */
export async function salvarSessao(sessao) {
  await gravar(STORE, sessao);
}

/**
 * Remove uma sessão (as séries são removidas pelo serviço).
 * @param {string} id
 * @returns {Promise<void>}
 */
export function removerSessao(id) {
  return apagar(STORE, id);
}
