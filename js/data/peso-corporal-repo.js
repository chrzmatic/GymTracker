/** Peso corporal registrado. */
import { lerTudo, ler, gravar, apagar } from './db.js';

const STORE = 'pesoCorporal';

/** Pesos, do mais recente para o mais antigo. */
export async function listarPesos() {
  const itens = await lerTudo(STORE);
  return itens.sort((a, b) => b.data.localeCompare(a.data));
}

export function buscarPeso(id) {
  return ler(STORE, id);
}

/**
 * @param {{id: string, data: string, kg: number}} peso
 */
export async function salvarPeso(peso) {
  await gravar(STORE, peso);
}

export function removerPeso(id) {
  return apagar(STORE, id);
}
