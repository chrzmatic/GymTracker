/**
 * Casos de uso da comparação entre sessões.
 *
 * Carrega as duas sessões com suas séries, resolve o peso corporal válido
 * na data de cada uma e entrega a comparação pronta para a tela.
 */

import { listarSessoes, buscarSessao } from '../data/sessoes-repo.js';
import { listarSeriesDaSessao } from '../data/series-repo.js';
import { listarPesos } from '../data/peso-corporal-repo.js';
import { mapaExercicios } from '../data/exercicios-repo.js';
import { pesoCorporalEm } from '../domain/metricas.js';
import { compararSessoes } from '../domain/comparacao.js';

/**
 * Compara duas sessões pelos IDs.
 *
 * A ordem é normalizada pela data: a mais antiga vira o "antes" e a mais
 * nova o "depois", independente de qual você escolheu primeiro. Assim uma
 * seta verde sempre significa progresso no tempo.
 *
 * @param {string} idA
 * @param {string} idB
 * @returns {Promise<Object|null>}
 */
export async function comparar(idA, idB) {
  const [umaSessao, outraSessao] = await Promise.all([buscarSessao(idA), buscarSessao(idB)]);
  if (!umaSessao || !outraSessao) return null;

  const ordenadas = [umaSessao, outraSessao].sort(
    (x, y) => x.data.localeCompare(y.data) || (x.criadaEm ?? 0) - (y.criadaEm ?? 0)
  );
  const [sessaoA, sessaoB] = ordenadas;

  const [seriesA, seriesB, exercicios, pesos] = await Promise.all([
    listarSeriesDaSessao(sessaoA.id),
    listarSeriesDaSessao(sessaoB.id),
    mapaExercicios(),
    listarPesos(),
  ]);

  const resultado = compararSessoes({
    sessaoA,
    seriesA,
    sessaoB,
    seriesB,
    exercicios,
    pesoA: pesoCorporalEm(pesos, sessaoA.data),
    pesoB: pesoCorporalEm(pesos, sessaoB.data),
  });

  return { ...resultado, sessaoA, sessaoB };
}

/**
 * Sessões disponíveis para escolher, da mais recente para a mais antiga.
 * @returns {Promise<Object[]>}
 */
export function listarParaComparar() {
  return listarSessoes();
}

/**
 * O atalho da especificação: a última sessão do mesmo treino, anterior a
 * uma sessão dada.
 * @param {Object} sessao
 * @returns {Promise<Object|null>}
 */
export async function anteriorDoMesmoTreino(sessao) {
  const todas = await listarSessoes();
  const candidatas = todas
    .filter((s) => s.treinoId === sessao.treinoId && s.id !== sessao.id)
    .filter(
      (s) =>
        s.data < sessao.data ||
        (s.data === sessao.data && (s.criadaEm ?? 0) < (sessao.criadaEm ?? 0))
    );
  return candidatas[0] ?? null;
}

/**
 * As duas sessões mais recentes do mesmo treino, para a tela abrir já
 * mostrando algo útil.
 * @returns {Promise<{a: Object, b: Object}|null>}
 */
export async function sugestaoDeComparacao() {
  const todas = await listarSessoes();
  for (const sessao of todas) {
    const anterior = await anteriorDoMesmoTreino(sessao);
    if (anterior) return { a: anterior, b: sessao };
  }
  return null;
}
