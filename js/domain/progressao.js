/**
 * Progressão: histórico de um exercício (gráfico) e resumo por semana.
 * Cada ponto do gráfico é uma sessão.
 */

import { inicioDaSemana, somarDias, diffEmDias } from '../utils/date.js';
import { metricasDeSeries, pesoCorporalEm } from './metricas.js';

/** Períodos do filtro. */
export const PERIODO = {
  QUATRO_SEMANAS: '4s',
  TRES_MESES: '3m',
  TUDO: 'tudo',
};

/** Dias de cada período (`null` = tudo). */
const DIAS_DO_PERIODO = {
  [PERIODO.QUATRO_SEMANAS]: 28,
  [PERIODO.TRES_MESES]: 91,
  [PERIODO.TUDO]: null,
};

/**
 * Histórico de um exercício, um ponto por sessão, em ordem cronológica.
 * @param {Object[]} sessoes
 * @param {Object[]} series
 * @param {string} exercicioId
 * @param {Object|undefined} exercicio
 * @param {{data: string, kg: number}[]} pesos
 * @returns {{data: string, sessaoId: string, treinoNome: string, cargaMaxima: number|null, volume: number|null, rm: number|null, series: number, reps: number}[]}
 */
export function historicoDoExercicio(sessoes, series, exercicioId, exercicio, pesos) {
  const porSessao = new Map();
  series.forEach((s) => {
    if (s.exercicioId !== exercicioId || s.aquecimento) return;
    if (!porSessao.has(s.sessaoId)) porSessao.set(s.sessaoId, []);
    porSessao.get(s.sessaoId).push(s);
  });

  return sessoes
    .filter((sessao) => porSessao.has(sessao.id))
    .map((sessao) => {
      const m = metricasDeSeries(
        porSessao.get(sessao.id),
        exercicio,
        pesoCorporalEm(pesos, sessao.data)
      );
      return {
        data: sessao.data,
        sessaoId: sessao.id,
        treinoNome: sessao.treinoNome,
        cargaMaxima: m.cargaMaxima,
        volume: m.volume,
        rm: m.rm,
        series: m.series,
        reps: m.reps,
      };
    })
    .sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Corta o histórico pelo período.
 * @param {Object[]} pontos
 * @param {string} periodo um valor de PERIODO
 * @param {string} hoje AAAA-MM-DD
 */
export function filtrarPorPeriodo(pontos, periodo, hoje) {
  const dias = DIAS_DO_PERIODO[periodo];
  if (dias === null || dias === undefined) return pontos;
  const inicio = somarDias(hoje, -dias);
  return pontos.filter((p) => p.data >= inicio);
}

/**
 * Treinos e volume por semana, da mais recente para a mais antiga.
 * Semanas sem treino não aparecem.
 * @param {Object[]} sessoes
 * @param {Object[]} series
 * @param {Map<string, Object>} exercicios
 * @param {{data: string, kg: number}[]} pesos
 * @param {number} inicioSemana 0 = domingo, 1 = segunda…
 * @returns {{semana: string, treinos: number, series: number, reps: number, volume: number|null}[]}
 */
export function resumoSemanal(sessoes, series, exercicios, pesos, inicioSemana = 1) {
  const porSessao = new Map();
  series.forEach((s) => {
    if (s.aquecimento) return;
    if (!porSessao.has(s.sessaoId)) porSessao.set(s.sessaoId, []);
    porSessao.get(s.sessaoId).push(s);
  });

  const semanas = new Map();

  sessoes.forEach((sessao) => {
    const chave = inicioDaSemana(sessao.data, inicioSemana);
    if (!semanas.has(chave)) {
      semanas.set(chave, { semana: chave, treinos: 0, series: 0, reps: 0, volume: 0, temVolume: false });
    }
    const alvo = semanas.get(chave);
    alvo.treinos += 1;

    const doSessao = porSessao.get(sessao.id) ?? [];
    const peso = pesoCorporalEm(pesos, sessao.data);

    // Por exercício, porque a carga efetiva depende do tipo.
    const porExercicio = new Map();
    doSessao.forEach((s) => {
      if (!porExercicio.has(s.exercicioId)) porExercicio.set(s.exercicioId, []);
      porExercicio.get(s.exercicioId).push(s);
    });

    porExercicio.forEach((lista, exercicioId) => {
      const m = metricasDeSeries(lista, exercicios.get(exercicioId), peso);
      alvo.series += m.series;
      alvo.reps += m.reps;
      if (m.volume !== null) {
        alvo.volume += m.volume;
        alvo.temVolume = true;
      }
    });
  });

  return [...semanas.values()]
    .map(({ temVolume, ...s }) => ({ ...s, volume: temVolume ? s.volume : null }))
    .sort((a, b) => b.semana.localeCompare(a.semana));
}

/**
 * Exercícios com histórico, do feito mais recentemente ao mais antigo.
 * @returns {{id: string, nome: string, sessoes: number, ultima: string}[]}
 */
export function exerciciosComHistorico(sessoes, series, exercicios) {
  const dataDaSessao = new Map(sessoes.map((s) => [s.id, s.data]));
  const porExercicio = new Map();

  series.forEach((s) => {
    if (s.aquecimento) return;
    const data = dataDaSessao.get(s.sessaoId);
    if (!data) return;
    if (!porExercicio.has(s.exercicioId)) {
      porExercicio.set(s.exercicioId, { sessoes: new Set(), ultima: data });
    }
    const alvo = porExercicio.get(s.exercicioId);
    alvo.sessoes.add(s.sessaoId);
    if (data > alvo.ultima) alvo.ultima = data;
  });

  return [...porExercicio.entries()]
    .map(([id, dados]) => ({
      id,
      nome: exercicios.get(id)?.nome ?? 'Exercício removido',
      sessoes: dados.sessoes.size,
      ultima: dados.ultima,
    }))
    .sort((a, b) => b.ultima.localeCompare(a.ultima) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Variação do primeiro ao último ponto.
 * @param {Object[]} pontos
 * @param {string} campo 'cargaMaxima' | 'volume' | 'rm'
 * @returns {{primeiro: number|null, ultimo: number|null, absoluta: number|null, percentual: number|null, dias: number|null}}
 */
export function variacao(pontos, campo) {
  const validos = pontos.filter((p) => p[campo] !== null && p[campo] !== undefined);
  if (validos.length < 2) {
    return { primeiro: null, ultimo: null, absoluta: null, percentual: null, dias: null };
  }
  const primeiro = validos[0];
  const ultimo = validos[validos.length - 1];
  const absoluta = ultimo[campo] - primeiro[campo];
  return {
    primeiro: primeiro[campo],
    ultimo: ultimo[campo],
    absoluta,
    percentual: primeiro[campo] === 0 ? null : (absoluta / Math.abs(primeiro[campo])) * 100,
    dias: diffEmDias(primeiro.data, ultimo.data),
  };
}
