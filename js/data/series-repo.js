/**
 * Repositório de séries registradas.
 * Uma série pertence a uma sessão e a um exercício realmente feito (em grupos
 * de alternativas, a alternativa escolhida naquele dia).
 */
import { lerTudo, gravar, apagar, lerPorIndice, transacao } from './db.js';

const STORE = 'series';

/**
 * Lista todas as séries de uma sessão, sem ordenar.
 *
 * A ordem de exibição (aquecimentos primeiro, numeração separada por
 * categoria) é regra de domínio, não de banco: quem precisar dela usa
 * `ordenarSeries` de `js/domain/sessao.js`, como faz o sessao-service.
 *
 * @param {string} sessaoId
 * @returns {Promise<Object[]>}
 */
export function listarSeriesDaSessao(sessaoId) {
  return lerPorIndice(STORE, 'sessaoId', sessaoId);
}

/**
 * Lista todas as séries de um exercício (histórico completo).
 * @param {string} exercicioId
 * @returns {Promise<Object[]>}
 */
export function listarSeriesDoExercicio(exercicioId) {
  return lerPorIndice(STORE, 'exercicioId', exercicioId);
}

/**
 * Lista todas as séries do banco. Usado por métricas e exportação.
 * @returns {Promise<Object[]>}
 */
export function listarTodasSeries() {
  return lerTudo(STORE);
}

/**
 * Cria ou atualiza uma série.
 * @param {Object} serie
 * @returns {Promise<void>}
 */
export async function salvarSerie(serie) {
  await gravar(STORE, serie);
}

/**
 * Remove uma série.
 * @param {string} id
 * @returns {Promise<void>}
 */
export function removerSerie(id) {
  return apagar(STORE, id);
}

/**
 * Remove todas as séries de uma sessão, numa única transação.
 * @param {string} sessaoId
 * @returns {Promise<void>}
 */
export async function removerSeriesDaSessao(sessaoId) {
  const itens = await lerPorIndice(STORE, 'sessaoId', sessaoId);
  return transacao(STORE, 'readwrite', (tx) => {
    const os = tx.objectStore(STORE);
    itens.forEach((s) => os.delete(s.id));
  });
}
