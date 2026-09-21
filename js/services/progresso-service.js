/**
 * Casos de uso da aba Progresso: gráficos por exercício, resumo semanal e
 * contador de séries por músculo.
 *
 * Tudo é recalculado a cada leitura, como nas outras abas: a especificação
 * pede que a contagem se atualize sozinha sempre que um treino, exercício
 * ou mapeamento de músculos for editado, e recalcular é a forma simples de
 * garantir isso.
 */

import { listarSessoes } from '../data/sessoes-repo.js';
import { listarTodasSeries } from '../data/series-repo.js';
import { listarTreinos } from '../data/treinos-repo.js';
import { listarMusculos } from '../data/musculos-repo.js';
import { mapaExercicios } from '../data/exercicios-repo.js';
import { listarPesos } from '../data/peso-corporal-repo.js';
import { lerTodasConfigs } from '../data/config-repo.js';
import { hojeIso, inicioDaSemana, somarDias } from '../utils/date.js';
import {
  historicoDoExercicio,
  filtrarPorPeriodo,
  resumoSemanal,
  exerciciosComHistorico,
  variacao,
  PERIODO,
} from '../domain/progressao.js';
import {
  planejadoPorMusculo,
  realizadoPorMusculo,
  compararPlanejadoRealizado,
  arredondarTabela,
} from '../domain/series-semanais.js';

/**
 * Lê tudo que as telas de progresso precisam, numa passada só pelo banco.
 * @returns {Promise<Object>}
 */
async function carregarTudo() {
  const [sessoes, series, treinos, musculos, exercicios, pesos, config] = await Promise.all([
    listarSessoes(),
    listarTodasSeries(),
    listarTreinos(),
    listarMusculos(),
    mapaExercicios(),
    listarPesos(),
    lerTodasConfigs(),
  ]);
  return { sessoes, series, treinos, musculos, exercicios, pesos, config };
}

/**
 * Exercícios que já têm histórico, para a escolha do gráfico.
 * @returns {Promise<Object[]>}
 */
export async function listarExerciciosComHistorico() {
  const { sessoes, series, exercicios } = await carregarTudo();
  return exerciciosComHistorico(sessoes, series, exercicios);
}

/**
 * Série histórica de um exercício, já filtrada pelo período.
 * @param {string} exercicioId
 * @param {string} [periodo] valor de PERIODO
 * @returns {Promise<{pontos: Object[], nome: string, variacoes: Object}>}
 */
export async function progressaoDoExercicio(exercicioId, periodo = PERIODO.TRES_MESES) {
  const { sessoes, series, exercicios, pesos } = await carregarTudo();
  const exercicio = exercicios.get(exercicioId);
  const todos = historicoDoExercicio(sessoes, series, exercicioId, exercicio, pesos);
  const pontos = filtrarPorPeriodo(todos, periodo, hojeIso());

  return {
    nome: exercicio ? exercicio.nome : 'Exercício removido',
    tipoCarga: exercicio ? exercicio.tipoCarga : 'carga',
    pontos,
    total: todos.length,
    variacoes: {
      cargaMaxima: variacao(pontos, 'cargaMaxima'),
      volume: variacao(pontos, 'volume'),
      rm: variacao(pontos, 'rm'),
    },
  };
}

/**
 * Resumo por semana: treinos e volume.
 * @returns {Promise<Object[]>}
 */
export async function semanas() {
  const { sessoes, series, exercicios, pesos, config } = await carregarTudo();
  return resumoSemanal(sessoes, series, exercicios, pesos, config.inicioSemana);
}

/**
 * Séries por músculo: planejado do ciclo contra realizado de uma semana.
 *
 * @param {string} [semana] AAAA-MM-DD do primeiro dia da semana desejada
 *   (padrão: a semana de hoje)
 * @returns {Promise<Object>}
 */
export async function seriesPorMusculo(semana) {
  const { sessoes, series, treinos, musculos, exercicios, config } = await carregarTudo();

  const inicio = semana ?? inicioDaSemana(hojeIso(), config.inicioSemana);
  const fim = somarDias(inicio, 6);

  const daSemana = new Set(
    sessoes.filter((s) => s.data >= inicio && s.data <= fim).map((s) => s.id)
  );
  const seriesDaSemana = series.filter((s) => daSemana.has(s.sessaoId));

  const rotacao = treinos.filter((t) => t.naRotacao);

  return {
    inicio,
    fim,
    treinosNaSemana: sessoes.filter((s) => s.data >= inicio && s.data <= fim).length,
    planejado: arredondarTabela(planejadoPorMusculo(rotacao, exercicios, musculos)),
    planejadoSemOpcionais: arredondarTabela(
      planejadoPorMusculo(rotacao, exercicios, musculos, { incluirOpcionais: false })
    ),
    realizado: arredondarTabela(realizadoPorMusculo(seriesDaSemana, exercicios, musculos)),
    comparacao: compararPlanejadoRealizado(
      arredondarTabela(planejadoPorMusculo(rotacao, exercicios, musculos)),
      arredondarTabela(realizadoPorMusculo(seriesDaSemana, exercicios, musculos))
    ),
    /** Quantos treinos tem um ciclo, para o rótulo deixar claro o que é. */
    treinosPorCiclo: rotacao.length,
  };
}

/**
 * As semanas que têm treino, para navegar no histórico do contador.
 * @returns {Promise<string[]>} início de cada semana, da mais recente para a mais antiga
 */
export async function semanasComTreino() {
  const { sessoes, config } = await carregarTudo();
  const chaves = new Set(sessoes.map((s) => inicioDaSemana(s.data, config.inicioSemana)));
  const atual = inicioDaSemana(hojeIso(), config.inicioSemana);
  chaves.add(atual);
  return [...chaves].sort((a, b) => b.localeCompare(a));
}

export { PERIODO };
