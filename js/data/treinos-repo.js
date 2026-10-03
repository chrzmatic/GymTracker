/**
 * Modelos de treino (A, B, C, extras).
 * A sessão guarda uma cópia do modelo, então editar o modelo não muda sessões antigas.
 */
import { apagar, contar, gravar, gravarVarios, ler, lerTudo } from './db.js';

const STORE = 'treinos';

/** Treinos na ordem definida pelo usuário. */
export async function listarTreinos() {
  const itens = await lerTudo(STORE);
  return itens.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
}

/** Só os treinos da rotação, na ordem. */
export async function listarRotacao() {
  const itens = await listarTreinos();
  return itens.filter((t) => t.naRotacao);
}

export function buscarTreino(id) {
  return ler(STORE, id);
}

export async function salvarTreino(treino) {
  await gravar(STORE, treino);
}

/** Apaga o modelo. Sessões antigas continuam intactas. */
export function removerTreino(id) {
  return apagar(STORE, id);
}

export function salvarTreinos(treinos) {
  return gravarVarios(STORE, treinos);
}

export function contarTreinos() {
  return contar(STORE);
}
