/**
 * Exercícios e músculos.
 * Excluir avisa onde o item é usado e limpa as referências.
 * Renomear nunca muda o ID, que liga o histórico ao exercício.
 */

import {
  listarExercicios,
  buscarExercicio,
  salvarExercicio,
  removerExercicio,
  mapaExercicios,
} from '../data/exercicios-repo.js';
import {
  listarMusculos,
  salvarMusculo,
  removerMusculo,
  salvarMusculos,
} from '../data/musculos-repo.js';
import { listarTreinos, salvarTreinos } from '../data/treinos-repo.js';
import { listarTodasSeries } from '../data/series-repo.js';
import { novoId, paraSlug } from '../utils/id.js';
import {
  criarExercicio,
  normalizarMusculos,
  usosDoExercicio,
  usosDoMusculo,
  tirarExercicioDosTreinos,
  tirarMusculoDosExercicios,
} from '../domain/treino.js';

/* --- Exercícios --- */

/**
 * Cria um exercício. O ID vem do nome (ex.: `ex-supino-reto`);
 * se já existir, usa um ID aleatório.
 * @param {string} nome
 * @param {string} tipoCarga
 * @param {Object[]} [musculos]
 */
export async function criar(nome, tipoCarga, musculos = []) {
  const slug = paraSlug(nome);
  const desejado = slug ? `ex-${slug}` : novoId('ex');
  const existente = await buscarExercicio(desejado);
  const exercicio = criarExercicio({
    id: existente ? novoId('ex') : desejado,
    nome,
    tipoCarga,
    musculos: normalizarMusculos(musculos),
  });
  await salvarExercicio(exercicio);
  return exercicio;
}

/** Grava um exercício editado. */
export async function salvar(exercicio) {
  const limpo = {
    ...exercicio,
    nome: exercicio.nome.trim(),
    musculos: normalizarMusculos(exercicio.musculos ?? []),
  };
  await salvarExercicio(limpo);
  return limpo;
}

/**
 * Onde o exercício é usado: treinos e quantas séries já registradas.
 * @returns {Promise<{treinos: Object[], series: number}>}
 */
export async function ondeEUsado(exercicioId) {
  const [treinos, series] = await Promise.all([listarTreinos(), listarTodasSeries()]);
  return {
    treinos: usosDoExercicio(treinos, exercicioId),
    series: series.filter((s) => s.exercicioId === exercicioId).length,
  };
}

/** Exclui e tira dos treinos. O histórico não muda. */
export async function excluir(exercicioId) {
  const treinos = await listarTreinos();
  const afetados = tirarExercicioDosTreinos(treinos, exercicioId);
  if (afetados.length) await salvarTreinos(afetados);
  await removerExercicio(exercicioId);
}

/* --- Músculos --- */

/** Cria um músculo no fim da lista. */
export async function criarMusculo(nome) {
  const existentes = await listarMusculos();
  const slug = paraSlug(nome);
  const desejado = slug ? `mus-${slug}` : novoId('mus');
  const jaExiste = existentes.some((m) => m.id === desejado);
  const musculo = {
    id: jaExiste ? novoId('mus') : desejado,
    nome: nome.trim(),
    ordem: existentes.length,
  };
  await salvarMusculo(musculo);
  return musculo;
}

/** Grava um músculo editado (o ID não muda). */
export function salvarMusculoEditado(musculo) {
  return salvarMusculo({ ...musculo, nome: musculo.nome.trim() });
}

export async function exerciciosComMusculo(musculoId) {
  return usosDoMusculo(await listarExercicios(), musculoId);
}

/** Exclui o músculo e tira dos exercícios. */
export async function excluirMusculo(musculoId) {
  const exercicios = await listarExercicios();
  const afetados = tirarMusculoDosExercicios(exercicios, musculoId);
  await Promise.all(afetados.map((e) => salvarExercicio(e)));
  await removerMusculo(musculoId);
}

/**
 * Sobe (-1) ou desce (1) um músculo na lista.
 * @returns {Promise<boolean>} false se já estava na ponta
 */
export async function moverMusculo(musculoId, direcao) {
  const lista = await listarMusculos();
  const i = lista.findIndex((m) => m.id === musculoId);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= lista.length) return false;
  const copia = lista.slice();
  [copia[i], copia[j]] = [copia[j], copia[i]];
  await salvarMusculos(copia.map((m, ordem) => ({ ...m, ordem })));
  return true;
}

export { listarExercicios, buscarExercicio, listarMusculos, mapaExercicios };
