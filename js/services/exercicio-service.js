/**
 * Casos de uso de exercícios e músculos.
 *
 * O cuidado central aqui é não deixar dado órfão: excluir um exercício que
 * está num treino, ou um músculo que está num exercício, precisa avisar
 * onde ele é usado e limpar as referências junto.
 *
 * Renomear nunca muda o ID — é isso que mantém o histórico de sessões
 * ligado ao exercício certo (spec seção 4).
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

/* ------------------------------------------------------------------ */
/* Exercícios                                                          */
/* ------------------------------------------------------------------ */

/**
 * Cria um exercício novo.
 *
 * O ID vem do nome (ex.: `ex-supino-reto`), para ficar legível num export
 * CSV ou num backup. Se já existir um exercício com esse ID, cai para um ID
 * aleatório em vez de sobrescrever o antigo.
 *
 * @param {string} nome
 * @param {string} tipoCarga
 * @param {Object[]} [musculos]
 * @returns {Promise<Object>} o exercício criado
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

/**
 * Grava alterações de um exercício. O ID nunca muda.
 * @param {Object} exercicio
 * @returns {Promise<Object>} o exercício gravado
 */
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
 * Onde um exercício é usado: modelos de treino e sessões já registradas.
 *
 * As sessões contam separado porque elas *não* são alteradas ao excluir: o
 * histórico fica como estava, só perde o nome do exercício na tela.
 *
 * @param {string} exercicioId
 * @returns {Promise<{treinos: Object[], series: number}>}
 */
export async function ondeEUsado(exercicioId) {
  const [treinos, series] = await Promise.all([listarTreinos(), listarTodasSeries()]);
  return {
    treinos: usosDoExercicio(treinos, exercicioId),
    series: series.filter((s) => s.exercicioId === exercicioId).length,
  };
}

/**
 * Exclui um exercício e o tira dos treinos que o usam.
 * O histórico de sessões não é tocado.
 * @param {string} exercicioId
 * @returns {Promise<void>}
 */
export async function excluir(exercicioId) {
  const treinos = await listarTreinos();
  const afetados = tirarExercicioDosTreinos(treinos, exercicioId);
  if (afetados.length) await salvarTreinos(afetados);
  await removerExercicio(exercicioId);
}

/* ------------------------------------------------------------------ */
/* Músculos                                                            */
/* ------------------------------------------------------------------ */

/**
 * Cria um músculo novo, no fim da lista.
 * @param {string} nome
 * @returns {Promise<Object>}
 */
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

/**
 * Renomeia um músculo. O ID não muda, então os exercícios continuam ligados.
 * @param {Object} musculo
 * @returns {Promise<void>}
 */
export function salvarMusculoEditado(musculo) {
  return salvarMusculo({ ...musculo, nome: musculo.nome.trim() });
}

/**
 * Quais exercícios usam um músculo.
 * @param {string} musculoId
 * @returns {Promise<Object[]>}
 */
export async function exerciciosComMusculo(musculoId) {
  return usosDoMusculo(await listarExercicios(), musculoId);
}

/**
 * Exclui um músculo e o remove dos exercícios que o citam.
 * @param {string} musculoId
 * @returns {Promise<void>}
 */
export async function excluirMusculo(musculoId) {
  const exercicios = await listarExercicios();
  const afetados = tirarMusculoDosExercicios(exercicios, musculoId);
  await Promise.all(afetados.map((e) => salvarExercicio(e)));
  await removerMusculo(musculoId);
}

/**
 * Sobe ou desce um músculo na lista.
 * A ordem é a que vai aparecer na tabela de séries semanais da Etapa 5.
 * @param {string} musculoId
 * @param {-1|1} direcao
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
