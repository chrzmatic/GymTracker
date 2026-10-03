/**
 * Dados padrão (js/data/seed-*.json).
 * Só entram sozinhos com o banco vazio; depois, só por "Restaurar" nas configurações.
 */

import { contarMusculos, salvarMusculos } from '../data/musculos-repo.js';
import { contarExercicios, salvarExercicios } from '../data/exercicios-repo.js';
import { contarTreinos, salvarTreinos } from '../data/treinos-repo.js';
import {
  contarAlimentos,
  salvarAlimentos,
  salvarPlanos,
  salvarPratos,
  salvarRefeicoes,
} from '../data/dieta-repo.js';

/** JSON já carregado. */
let cacheTreino = null;

/** JSON padrão do treino. */
export async function carregarSeedTreino() {
  if (cacheTreino) return cacheTreino;
  const url = new URL('../data/seed-treino.json', import.meta.url);
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error('Não foi possível ler a carga inicial de treino.');
  cacheTreino = await resposta.json();
  return cacheTreino;
}

/**
 * Grava músculos, exercícios e treinos padrão por cima dos mesmos IDs.
 * Não apaga o que você criou nem o histórico.
 */
export async function restaurarTreinoPadrao() {
  const seed = await carregarSeedTreino();
  await salvarMusculos(seed.musculos);
  await salvarExercicios(seed.exercicios);
  await salvarTreinos(seed.treinos);
}

export async function treinoVazio() {
  const [m, e, t] = await Promise.all([
    contarMusculos(),
    contarExercicios(),
    contarTreinos(),
  ]);
  return m === 0 && e === 0 && t === 0;
}

/** JSON já carregado. */
let cacheDieta = null;

/** JSON padrão da dieta. */
export async function carregarSeedDieta() {
  if (cacheDieta) return cacheDieta;
  const url = new URL('../data/seed-dieta.json', import.meta.url);
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error('Não foi possível ler a carga inicial da dieta.');
  cacheDieta = await resposta.json();
  return cacheDieta;
}

/** Grava alimentos, pratos, refeições e planos padrão por cima dos mesmos IDs. */
export async function restaurarDietaPadrao() {
  const seed = await carregarSeedDieta();
  await salvarAlimentos(seed.alimentos);
  await salvarPratos(seed.pratos);
  await salvarRefeicoes(seed.refeicoes);
  await salvarPlanos(seed.planos);
}

export async function dietaVazia() {
  return (await contarAlimentos()) === 0;
}

/**
 * Carrega os dados padrão que faltarem (treino e dieta separados).
 * @returns {Promise<{treino: boolean, dieta: boolean}>} o que foi carregado
 */
export async function carregarSeNecessario() {
  const carregou = { treino: false, dieta: false };

  if (await treinoVazio()) {
    await restaurarTreinoPadrao();
    carregou.treino = true;
  }
  if (await dietaVazia()) {
    await restaurarDietaPadrao();
    carregou.dieta = true;
  }

  return carregou;
}
