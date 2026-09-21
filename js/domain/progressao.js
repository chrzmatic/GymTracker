/**
 * Progressão ao longo do tempo (especificação, seção 6.6).
 *
 * Duas coisas: a série histórica de um exercício, que vira gráfico, e o
 * resumo por semana, que vira uma lista.
 *
 * Um ponto do gráfico é uma **sessão**, não uma série: o que interessa é
 * como o exercício evoluiu de treino para treino. Mais de uma sessão no
 * mesmo dia gera dois pontos, porque foram dois treinos.
 */

import { inicioDaSemana, somarDias, diffEmDias } from '../utils/date.js';
import { metricasDeSeries, pesoCorporalEm } from './metricas.js';

/** Períodos aceitos pelo filtro da tela. */
export const PERIODO = {
  QUATRO_SEMANAS: '4s',
  TRES_MESES: '3m',
  TUDO: 'tudo',
};

/** Quantos dias cada período cobre. `null` = sem limite. */
const DIAS_DO_PERIODO = {
  [PERIODO.QUATRO_SEMANAS]: 28,
  [PERIODO.TRES_MESES]: 91,
  [PERIODO.TUDO]: null,
};

/**
 * Série histórica de um exercício: um ponto por sessão em que ele foi feito.
 *
 * @param {Object[]} sessoes todas as sessões
 * @param {Object[]} series todas as séries
 * @param {string} exercicioId
 * @param {Object|undefined} exercicio
 * @param {{data: string, kg: number}[]} pesos registros de peso corporal
 * @returns {{data: string, sessaoId: string, treinoNome: string, cargaMaxima: number|null, volume: number|null, rm: number|null, series: number, reps: number}[]}
 *   em ordem cronológica
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
 * Corta a série histórica pelo período escolhido.
 * @param {Object[]} pontos saída de historicoDoExercicio
 * @param {string} periodo um valor de PERIODO
 * @param {string} hoje AAAA-MM-DD
 * @returns {Object[]}
 */
export function filtrarPorPeriodo(pontos, periodo, hoje) {
  const dias = DIAS_DO_PERIODO[periodo];
  if (dias === null || dias === undefined) return pontos;
  const inicio = somarDias(hoje, -dias);
  return pontos.filter((p) => p.data >= inicio);
}

/**
 * Resumo por semana: quantos treinos e quanto volume.
 *
 * As semanas vêm da mais recente para a mais antiga, e semanas sem treino
 * nenhum não aparecem — a lista é do que aconteceu, não um calendário.
 *
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

    // Agrupa por exercício, porque a carga efetiva depende do tipo dele.
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
 * Exercícios com histórico, para a tela oferecer na escolha do gráfico.
 *
 * Ordenados pelo que foi feito mais recentemente, porque é o que você
 * provavelmente quer ver.
 *
 * @param {Object[]} sessoes
 * @param {Object[]} series
 * @param {Map<string, Object>} exercicios
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
 * Variação entre o primeiro e o último ponto de uma série histórica.
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
