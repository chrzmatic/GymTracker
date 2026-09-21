/**
 * Repositório de configurações (pares chave/valor).
 * Guarda dia de início da semana, X da rotação, estado do Dropbox etc.
 */
import { lerTudo, ler, gravar, apagar } from './db.js';

const STORE = 'config';

/** Valores padrão de todas as configurações conhecidas. */
export const CONFIG_PADRAO = {
  inicioSemana: 1,
  diasParaReiniciarRotacao: 2,
  unidade: 'kg',
};

/**
 * Lê uma configuração, caindo no padrão quando ainda não foi salva.
 * @param {string} chave
 * @returns {Promise<*>}
 */
export async function lerConfig(chave) {
  const registro = await ler(STORE, chave);
  return registro ? registro.valor : CONFIG_PADRAO[chave];
}

/**
 * Lê todas as configurações mescladas com os padrões.
 * @returns {Promise<Object>}
 */
export async function lerTodasConfigs() {
  const registros = await lerTudo(STORE);
  const salvas = Object.fromEntries(registros.map((r) => [r.chave, r.valor]));
  return { ...CONFIG_PADRAO, ...salvas };
}

/**
 * Grava uma configuração.
 * @param {string} chave
 * @param {*} valor
 * @returns {Promise<void>}
 */
export async function salvarConfig(chave, valor) {
  await gravar(STORE, { chave, valor });
}

/**
 * Apaga uma configuração, voltando ao padrão.
 * @param {string} chave
 * @returns {Promise<void>}
 */
export function removerConfig(chave) {
  return apagar(STORE, chave);
}
