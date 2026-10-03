/**
 * Dieta: alimentos, pratos, refeições e planos.
 * O plano guarda só os IDs das refeições, porque uma refeição pode estar nos dois planos.
 */
import {
  lerTudo,
  ler,
  contar,
  gravar as gravarNoBanco,
  apagar as apagarDoBanco,
  gravarVarios as gravarVariosNoBanco,
} from './db.js';
import { dadosMudaram } from '../sync/gatilho.js';

/* --- Escrita, com aviso ao backup --- */

/**
 * Toda escrita deste arquivo avisa o backup (sync/gatilho.js).
 * Assim nenhuma função nova esquece de avisar.
 */

async function gravar(store, registro) {
  await gravarNoBanco(store, registro);
  dadosMudaram();
}

async function apagar(store, chave) {
  await apagarDoBanco(store, chave);
  dadosMudaram();
}

async function gravarVarios(store, registros) {
  await gravarVariosNoBanco(store, registros);
  dadosMudaram();
}

/* --- Alimentos --- */

/** Alimentos em ordem alfabética. */
export async function listarAlimentos() {
  const itens = await lerTudo('alimentos');
  return itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Mapa id → alimento, o formato que os cálculos usam. */
export async function mapaAlimentos() {
  return new Map((await listarAlimentos()).map((a) => [a.id, a]));
}

export function buscarAlimento(id) {
  return ler('alimentos', id);
}

export async function salvarAlimento(alimento) {
  await gravar('alimentos', alimento);
}

export function removerAlimento(id) {
  return apagar('alimentos', id);
}

export function salvarAlimentos(alimentos) {
  return gravarVarios('alimentos', alimentos);
}

/* --- Pratos compostos --- */

export async function listarPratos() {
  const itens = await lerTudo('pratos');
  return itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export async function mapaPratos() {
  return new Map((await listarPratos()).map((p) => [p.id, p]));
}

export function buscarPrato(id) {
  return ler('pratos', id);
}

export async function salvarPrato(prato) {
  await gravar('pratos', prato);
}

export function removerPrato(id) {
  return apagar('pratos', id);
}

export function salvarPratos(pratos) {
  return gravarVarios('pratos', pratos);
}

/* --- Refeições --- */

export async function listarRefeicoes() {
  const itens = await lerTudo('refeicoes');
  return itens.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
}

export function buscarRefeicao(id) {
  return ler('refeicoes', id);
}

export async function salvarRefeicao(refeicao) {
  await gravar('refeicoes', refeicao);
}

export function removerRefeicao(id) {
  return apagar('refeicoes', id);
}

export function salvarRefeicoes(refeicoes) {
  return gravarVarios('refeicoes', refeicoes);
}

/* --- Planos --- */

export async function listarPlanos() {
  const itens = await lerTudo('planos');
  return itens.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
}

export function buscarPlano(id) {
  return ler('planos', id);
}

export async function salvarPlano(plano) {
  await gravar('planos', plano);
}

export function salvarPlanos(planos) {
  return gravarVarios('planos', planos);
}

export function contarAlimentos() {
  return contar('alimentos');
}

/* --- Plano escolhido por dia --- */

/**
 * Plano fixado à mão numa data, ou null.
 * @param {string} data AAAA-MM-DD
 */
export async function lerTipoDia(data) {
  const registro = await ler('tipoDia', data);
  return registro ? registro.planoId : null;
}

export async function salvarTipoDia(data, planoId) {
  await gravar('tipoDia', { data, planoId });
}

export function removerTipoDia(data) {
  return apagar('tipoDia', data);
}
