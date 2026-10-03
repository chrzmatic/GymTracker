/** Configurações (chave/valor): início da semana, X da rotação etc. */
import { apagar, gravar, ler, lerTudo } from './db.js';

const STORE = 'config';

/** Valores padrão. */
export const CONFIG_PADRAO = {
  inicioSemana: 1,
  diasParaReiniciarRotacao: 2,
  unidade: 'kg',
};

/** Lê uma configuração, ou o padrão se nunca foi salva. */
export async function lerConfig(chave) {
  const registro = await ler(STORE, chave);
  return registro ? registro.valor : CONFIG_PADRAO[chave];
}

/** Todas as configurações, com os padrões preenchidos. */
export async function lerTodasConfigs() {
  const registros = await lerTudo(STORE);
  const salvas = Object.fromEntries(registros.map((r) => [r.chave, r.valor]));
  return { ...CONFIG_PADRAO, ...salvas };
}

export async function salvarConfig(chave, valor) {
  await gravar(STORE, { chave, valor });
}

/** Apaga uma configuração (volta ao padrão). */
export function removerConfig(chave) {
  return apagar(STORE, chave);
}
