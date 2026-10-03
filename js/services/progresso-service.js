/**
 * Aba Progresso: gráficos, resumo semanal e séries por músculo.
 * Sempre recalculado, então edições aparecem na hora.
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
  exerciciosComHistorico,
  filtrarPorPeriodo,
  historicoDoExercicio,
  PERIODO,
  resumoSemanal,
  variacao,
} from '../domain/progressao.js';
import {
  arredondarTabela,
  compararPlanejadoRealizado,
  planejadoPorMusculo,
  realizadoPorMusculo,
} from '../domain/series-semanais.js';

/** Tudo que a aba precisa, numa leitura só. */
async function carregarTudo() {
  const [sessoes, series, treinos, musculos, exercicios, pesos, config] = await Promise
    .all([
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

/** Exercícios com histórico, para escolher o gráfico. */
export async function listarExerciciosComHistorico() {
  const { sessoes, series, exercicios } = await carregarTudo();
  return exerciciosComHistorico(sessoes, series, exercicios);
}

/**
 * Histórico de um exercício no período.
 * @param {string} exercicioId
 * @param {string} [periodo] um valor de PERIODO
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

/** Treinos e volume por semana. */
export async function semanas() {
  const { sessoes, series, exercicios, pesos, config } = await carregarTudo();
  return resumoSemanal(sessoes, series, exercicios, pesos, config.inicioSemana);
}

/**
 * Séries por músculo: planejado do ciclo contra realizado na semana.
 * @param {string} [semana] AAAA-MM-DD do início da semana (padrão: a atual)
 */
export async function seriesPorMusculo(semana) {
  const { sessoes, series, treinos, musculos, exercicios, config } = await carregarTudo();

  const inicio = semana ?? inicioDaSemana(hojeIso(), config.inicioSemana);
  const fim = somarDias(inicio, 6);

  const daSemana = new Set(
    sessoes.filter((s) => s.data >= inicio && s.data <= fim).map((s) => s.id),
  );
  const seriesDaSemana = series.filter((s) => daSemana.has(s.sessaoId));

  const rotacao = treinos.filter((t) => t.naRotacao);

  return {
    inicio,
    fim,
    treinosNaSemana: sessoes.filter((s) => s.data >= inicio && s.data <= fim).length,
    planejado: arredondarTabela(planejadoPorMusculo(rotacao, exercicios, musculos)),
    planejadoSemOpcionais: arredondarTabela(
      planejadoPorMusculo(rotacao, exercicios, musculos, { incluirOpcionais: false }),
    ),
    realizado: arredondarTabela(
      realizadoPorMusculo(seriesDaSemana, exercicios, musculos),
    ),
    comparacao: compararPlanejadoRealizado(
      arredondarTabela(planejadoPorMusculo(rotacao, exercicios, musculos)),
      arredondarTabela(realizadoPorMusculo(seriesDaSemana, exercicios, musculos)),
    ),
    /** Treinos num ciclo, para o rótulo. */
    treinosPorCiclo: rotacao.length,
  };
}

/**
 * Semanas com treino, da mais recente para a mais antiga.
 * @returns {Promise<string[]>} início de cada semana
 */
export async function semanasComTreino() {
  const { sessoes, config } = await carregarTudo();
  const chaves = new Set(sessoes.map((s) => inicioDaSemana(s.data, config.inicioSemana)));
  const atual = inicioDaSemana(hojeIso(), config.inicioSemana);
  chaves.add(atual);
  return [...chaves].sort((a, b) => b.localeCompare(a));
}

export { PERIODO };
