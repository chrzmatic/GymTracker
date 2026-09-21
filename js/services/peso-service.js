/**
 * Casos de uso do peso corporal.
 *
 * O peso não é só um número de acompanhamento: é ingrediente de cálculo.
 * Exercícios de peso corporal e assistidos só têm carga efetiva com ele,
 * e o que vale é sempre o peso mais recente **até a data da sessão** — um
 * pull-up feito em março é comparado com o peso de março, não com o de
 * hoje.
 */

import {
  listarPesos,
  buscarPeso,
  salvarPeso,
  removerPeso,
} from '../data/peso-corporal-repo.js';
import { novoId } from '../utils/id.js';
import { hojeIso } from '../utils/date.js';
import { pesoCorporalEm } from '../domain/metricas.js';

/**
 * Registra ou atualiza o peso de uma data.
 * Um registro por data: gravar de novo na mesma data substitui o anterior,
 * em vez de deixar dois pesos brigando pelo mesmo dia.
 * @param {string} data AAAA-MM-DD
 * @param {number} kg
 * @returns {Promise<Object>} o registro gravado
 */
export async function registrar(data, kg) {
  const existentes = await listarPesos();
  const jaTem = existentes.find((p) => p.data === data);
  const peso = { id: jaTem ? jaTem.id : novoId('peso'), data, kg };
  await salvarPeso(peso);
  return peso;
}

/**
 * O peso corporal válido numa data.
 * @param {string} [data] AAAA-MM-DD (padrão: hoje)
 * @returns {Promise<number|null>}
 */
export async function pesoEm(data = hojeIso()) {
  return pesoCorporalEm(await listarPesos(), data);
}

/**
 * O peso válido em várias datas de uma vez, lendo o banco uma só vez.
 * @param {string[]} datas
 * @returns {Promise<Map<string, number|null>>}
 */
export async function pesosEm(datas) {
  const pesos = await listarPesos();
  return new Map(datas.map((d) => [d, pesoCorporalEm(pesos, d)]));
}

/**
 * Variação entre o primeiro e o último registro.
 * @returns {Promise<{primeiro: Object|null, ultimo: Object|null, variacao: number|null}>}
 */
export async function resumo() {
  const pesos = await listarPesos();
  if (!pesos.length) return { primeiro: null, ultimo: null, variacao: null };
  const ultimo = pesos[0];
  const primeiro = pesos[pesos.length - 1];
  return { primeiro, ultimo, variacao: ultimo.kg - primeiro.kg };
}

export { listarPesos, buscarPeso, removerPeso };
