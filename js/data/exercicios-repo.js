/** Exercícios: nome, tipo de carga e músculos trabalhados. */
import { apagar, contar, gravar, gravarVarios, ler, lerTudo } from './db.js';
import { ROTULO_CARGA, TIPOS_CARGA } from '../utils/constantes.js';

const STORE = 'exercicios';

export { ROTULO_CARGA, TIPOS_CARGA };

/** Exercícios em ordem alfabética. */
export async function listarExercicios() {
  const itens = await lerTudo(STORE);
  return itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function buscarExercicio(id) {
  return ler(STORE, id);
}

/** Cria ou atualiza. Renomear não muda o ID. */
export async function salvarExercicio(exercicio) {
  await gravar(STORE, exercicio);
}

export function removerExercicio(id) {
  return apagar(STORE, id);
}

export function salvarExercicios(exercicios) {
  return gravarVarios(STORE, exercicios);
}

export function contarExercicios() {
  return contar(STORE);
}

/** Mapa id → exercício. */
export async function mapaExercicios() {
  const itens = await listarExercicios();
  return new Map(itens.map((e) => [e.id, e]));
}
