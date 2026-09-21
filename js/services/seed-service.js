/**
 * Carga inicial dos dados padrão.
 *
 * Os arquivos .md são a fonte oficial dos valores, mas o app nunca os lê:
 * eles são convertidos em js/data/seed-*.json, que é o que carregamos aqui.
 *
 * A carga automática só acontece com o banco vazio (primeira abertura).
 * Depois disso os dados são do usuário e nunca são sobrescritos sozinhos;
 * a tela de configurações oferece "Restaurar dados padrão" com confirmação.
 */

import { salvarMusculos, contarMusculos } from '../data/musculos-repo.js';
import { salvarExercicios, contarExercicios } from '../data/exercicios-repo.js';
import { salvarTreinos, contarTreinos } from '../data/treinos-repo.js';
import {
  salvarAlimentos,
  salvarPratos,
  salvarRefeicoes,
  salvarPlanos,
  contarAlimentos,
} from '../data/dieta-repo.js';

/** Cache do JSON carregado, para não buscar duas vezes. */
let cacheTreino = null;

/**
 * Carrega o JSON de carga inicial de treino.
 * @returns {Promise<Object>}
 */
export async function carregarSeedTreino() {
  if (cacheTreino) return cacheTreino;
  const url = new URL('../data/seed-treino.json', import.meta.url);
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error('Não foi possível ler a carga inicial de treino.');
  cacheTreino = await resposta.json();
  return cacheTreino;
}

/**
 * Grava os dados padrão de treino (músculos, exercícios e treinos).
 * Sobrescreve pelos IDs fixos, sem apagar nada que o usuário tenha criado
 * e sem tocar no histórico de sessões.
 * @returns {Promise<void>}
 */
export async function restaurarTreinoPadrao() {
  const seed = await carregarSeedTreino();
  await salvarMusculos(seed.musculos);
  await salvarExercicios(seed.exercicios);
  await salvarTreinos(seed.treinos);
}

/**
 * Diz se o banco de treino está vazio.
 * @returns {Promise<boolean>}
 */
export async function treinoVazio() {
  const [m, e, t] = await Promise.all([
    contarMusculos(),
    contarExercicios(),
    contarTreinos(),
  ]);
  return m === 0 && e === 0 && t === 0;
}

/** Cache do JSON da dieta. */
let cacheDieta = null;

/**
 * Carrega o JSON de carga inicial da dieta.
 * @returns {Promise<Object>}
 */
export async function carregarSeedDieta() {
  if (cacheDieta) return cacheDieta;
  const url = new URL('../data/seed-dieta.json', import.meta.url);
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error('Não foi possível ler a carga inicial da dieta.');
  cacheDieta = await resposta.json();
  return cacheDieta;
}

/**
 * Grava os dados padrão da dieta (índice, pratos, refeições e planos).
 * Sobrescreve pelos IDs fixos, como o treino.
 * @returns {Promise<void>}
 */
export async function restaurarDietaPadrao() {
  const seed = await carregarSeedDieta();
  await salvarAlimentos(seed.alimentos);
  await salvarPratos(seed.pratos);
  await salvarRefeicoes(seed.refeicoes);
  await salvarPlanos(seed.planos);
}

/**
 * Diz se o banco de dieta está vazio.
 * @returns {Promise<boolean>}
 */
export async function dietaVazia() {
  return (await contarAlimentos()) === 0;
}

/**
 * Roda a carga inicial se for a primeira abertura do app.
 *
 * Treino e dieta são checados separadamente: quem já usava o app antes da
 * Etapa 6 tem treino cheio e dieta vazia, e precisa receber só a dieta.
 *
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
