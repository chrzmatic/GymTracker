/** Séries registradas. Cada série é de uma sessão e de um exercício. */
import { lerTudo, gravar, apagar, lerPorIndice, transacao } from './db.js';

const STORE = 'series';

/** Séries de uma sessão, sem ordem. Para ordenar, use `ordenarSeries` (domain/sessao.js). */
export function listarSeriesDaSessao(sessaoId) {
  return lerPorIndice(STORE, 'sessaoId', sessaoId);
}

export function listarSeriesDoExercicio(exercicioId) {
  return lerPorIndice(STORE, 'exercicioId', exercicioId);
}

/** Todas as séries do banco. */
export function listarTodasSeries() {
  return lerTudo(STORE);
}

export async function salvarSerie(serie) {
  await gravar(STORE, serie);
}

export function removerSerie(id) {
  return apagar(STORE, id);
}

/** Apaga as séries de uma sessão numa transação. */
export async function removerSeriesDaSessao(sessaoId) {
  const itens = await lerPorIndice(STORE, 'sessaoId', sessaoId);
  return transacao(STORE, 'readwrite', (tx) => {
    const os = tx.objectStore(STORE);
    itens.forEach((s) => os.delete(s.id));
  });
}
