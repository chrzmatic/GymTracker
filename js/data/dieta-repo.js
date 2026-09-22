/**
 * Repositórios da dieta: alimentos, pratos compostos, refeições e planos.
 *
 * Ficam juntos num arquivo só porque são quatro stores pequenas do mesmo
 * assunto, com as mesmas operações — separar em quatro arquivos de vinte
 * linhas iguais não ajudaria ninguém a achar nada.
 *
 * As refeições são guardadas à parte dos planos de propósito: o jantar é o
 * mesmo no dia de treino e no dia sem treino, e editar uma vez precisa
 * valer para os dois. O plano guarda só os IDs das refeições dele.
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

/* ------------------------------------------------------------------ */
/* Escrita, com aviso ao backup                                        */
/* ------------------------------------------------------------------ */

/**
 * A especificação manda fazer backup "ao salvar alterações no índice,
 * pratos compostos ou plano de dieta". São umas doze funções de escrita
 * aqui embaixo, e pendurar a chamada em cada uma seria doze chances de
 * esquecer — inclusive na próxima que eu escrever.
 *
 * Em vez disso, os três helpers de escrita do banco entram embrulhados:
 * qualquer gravação neste arquivo avisa o backup, hoje e depois. O aviso
 * é o de `sync/gatilho.js`, que não faz nada se o Dropbox não estiver
 * conectado e nunca atrasa quem salvou.
 */

/** @param {string} store @param {Object} registro @returns {Promise<void>} */
async function gravar(store, registro) {
  await gravarNoBanco(store, registro);
  dadosMudaram();
}

/** @param {string} store @param {*} chave @returns {Promise<void>} */
async function apagar(store, chave) {
  await apagarDoBanco(store, chave);
  dadosMudaram();
}

/** @param {string} store @param {Object[]} registros @returns {Promise<void>} */
async function gravarVarios(store, registros) {
  await gravarVariosNoBanco(store, registros);
  dadosMudaram();
}

/* ------------------------------------------------------------------ */
/* Alimentos                                                           */
/* ------------------------------------------------------------------ */

/**
 * Lista os alimentos em ordem alfabética.
 * @returns {Promise<Object[]>}
 */
export async function listarAlimentos() {
  const itens = await lerTudo('alimentos');
  return itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Mapa id → alimento, que é o formato que os cálculos usam.
 * @returns {Promise<Map<string, Object>>}
 */
export async function mapaAlimentos() {
  return new Map((await listarAlimentos()).map((a) => [a.id, a]));
}

/** @param {string} id @returns {Promise<Object|undefined>} */
export function buscarAlimento(id) {
  return ler('alimentos', id);
}

/** @param {Object} alimento @returns {Promise<void>} */
export async function salvarAlimento(alimento) {
  await gravar('alimentos', alimento);
}

/** @param {string} id @returns {Promise<void>} */
export function removerAlimento(id) {
  return apagar('alimentos', id);
}

/** @param {Object[]} alimentos @returns {Promise<void>} */
export function salvarAlimentos(alimentos) {
  return gravarVarios('alimentos', alimentos);
}

/* ------------------------------------------------------------------ */
/* Pratos compostos                                                    */
/* ------------------------------------------------------------------ */

/** @returns {Promise<Object[]>} */
export async function listarPratos() {
  const itens = await lerTudo('pratos');
  return itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** @returns {Promise<Map<string, Object>>} */
export async function mapaPratos() {
  return new Map((await listarPratos()).map((p) => [p.id, p]));
}

/** @param {string} id @returns {Promise<Object|undefined>} */
export function buscarPrato(id) {
  return ler('pratos', id);
}

/** @param {Object} prato @returns {Promise<void>} */
export async function salvarPrato(prato) {
  await gravar('pratos', prato);
}

/** @param {string} id @returns {Promise<void>} */
export function removerPrato(id) {
  return apagar('pratos', id);
}

/** @param {Object[]} pratos @returns {Promise<void>} */
export function salvarPratos(pratos) {
  return gravarVarios('pratos', pratos);
}

/* ------------------------------------------------------------------ */
/* Refeições                                                           */
/* ------------------------------------------------------------------ */

/** @returns {Promise<Object[]>} */
export async function listarRefeicoes() {
  const itens = await lerTudo('refeicoes');
  return itens.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
}

/** @param {string} id @returns {Promise<Object|undefined>} */
export function buscarRefeicao(id) {
  return ler('refeicoes', id);
}

/** @param {Object} refeicao @returns {Promise<void>} */
export async function salvarRefeicao(refeicao) {
  await gravar('refeicoes', refeicao);
}

/** @param {string} id @returns {Promise<void>} */
export function removerRefeicao(id) {
  return apagar('refeicoes', id);
}

/** @param {Object[]} refeicoes @returns {Promise<void>} */
export function salvarRefeicoes(refeicoes) {
  return gravarVarios('refeicoes', refeicoes);
}

/* ------------------------------------------------------------------ */
/* Planos                                                              */
/* ------------------------------------------------------------------ */

/** @returns {Promise<Object[]>} */
export async function listarPlanos() {
  const itens = await lerTudo('planos');
  return itens.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
}

/** @param {string} id @returns {Promise<Object|undefined>} */
export function buscarPlano(id) {
  return ler('planos', id);
}

/** @param {Object} plano @returns {Promise<void>} */
export async function salvarPlano(plano) {
  await gravar('planos', plano);
}

/** @param {Object[]} planos @returns {Promise<void>} */
export function salvarPlanos(planos) {
  return gravarVarios('planos', planos);
}

/** @returns {Promise<number>} */
export function contarAlimentos() {
  return contar('alimentos');
}

/* ------------------------------------------------------------------ */
/* Tipo do dia                                                         */
/* ------------------------------------------------------------------ */

/**
 * Qual plano você escolheu seguir numa data.
 *
 * Guardado por data porque a decisão é por dia: de manhã, antes de saber
 * se vai treinar, você pode fixar um dos dois planos.
 *
 * @param {string} data AAAA-MM-DD
 * @returns {Promise<string|null>} id do plano, ou null se nunca escolheu
 */
export async function lerTipoDia(data) {
  const registro = await ler('tipoDia', data);
  return registro ? registro.planoId : null;
}

/**
 * @param {string} data AAAA-MM-DD
 * @param {string} planoId
 * @returns {Promise<void>}
 */
export async function salvarTipoDia(data, planoId) {
  await gravar('tipoDia', { data, planoId });
}

/** @param {string} data @returns {Promise<void>} */
export function removerTipoDia(data) {
  return apagar('tipoDia', data);
}
