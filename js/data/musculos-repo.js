/** Músculos (usados nas séries semanais). */
import { lerTudo, ler, gravar, apagar, gravarVarios, contar } from './db.js';

const STORE = 'musculos';

export async function listarMusculos() {
  const itens = await lerTudo(STORE);
  return itens.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function buscarMusculo(id) {
  return ler(STORE, id);
}

/**
 * @param {{id: string, nome: string, ordem?: number}} musculo
 */
export async function salvarMusculo(musculo) {
  await gravar(STORE, musculo);
}

export function removerMusculo(id) {
  return apagar(STORE, id);
}

export function salvarMusculos(musculos) {
  return gravarVarios(STORE, musculos);
}

export function contarMusculos() {
  return contar(STORE);
}
