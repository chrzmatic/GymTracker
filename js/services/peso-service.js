/** Peso corporal. Vale sempre o peso mais recente até a data da sessão. */

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
 * Registra o peso de uma data. Um por data: gravar de novo substitui.
 * @param {string} data AAAA-MM-DD
 * @param {number} kg
 */
export async function registrar(data, kg) {
  const existentes = await listarPesos();
  const jaTem = existentes.find((p) => p.data === data);
  const peso = { id: jaTem ? jaTem.id : novoId('peso'), data, kg };
  await salvarPeso(peso);
  return peso;
}

/** Peso válido numa data (padrão: hoje), ou null. */
export async function pesoEm(data = hojeIso()) {
  return pesoCorporalEm(await listarPesos(), data);
}

/**
 * Peso válido em várias datas, lendo o banco uma vez.
 * @returns {Promise<Map<string, number|null>>}
 */
export async function pesosEm(datas) {
  const pesos = await listarPesos();
  return new Map(datas.map((d) => [d, pesoCorporalEm(pesos, d)]));
}

/**
 * Primeiro, último e variação.
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
