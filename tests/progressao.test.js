/**
 * Testes da progressão: série histórica de um exercício, filtro de período
 * e resumo semanal.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  historicoDoExercicio,
  filtrarPorPeriodo,
  resumoSemanal,
  exerciciosComHistorico,
  variacao,
  PERIODO,
} from '../js/domain/progressao.js';

const CARGA = { id: 'ex-supino', nome: 'Supino', tipoCarga: 'carga' };
const ASSISTIDO = { id: 'ex-assist', nome: 'Barra assistida', tipoCarga: 'assistido' };
const exercicios = new Map([
  ['ex-supino', CARGA],
  ['ex-assist', ASSISTIDO],
  ['ex-remada', { id: 'ex-remada', nome: 'Remada', tipoCarga: 'carga' }],
]);

const sessoes = [
  { id: 's1', data: '2025-09-01', treinoNome: 'A' },
  { id: 's2', data: '2025-09-08', treinoNome: 'A' },
  { id: 's3', data: '2025-09-15', treinoNome: 'A' },
];

/** Série de teste. */
const s = (sessaoId, exercicioId, carga, reps, aquecimento = false) => ({
  sessaoId,
  exercicioId,
  carga,
  reps,
  aquecimento,
});

const series = [
  s('s1', 'ex-supino', 60, 10),
  s('s1', 'ex-supino', 60, 8),
  s('s2', 'ex-supino', 62.5, 10),
  s('s3', 'ex-supino', 65, 10),
  s('s3', 'ex-supino', 65, 8),
  s('s3', 'ex-remada', 40, 12),
];

/* ------------------------------------------------------------------ */
/* Série histórica                                                     */
/* ------------------------------------------------------------------ */

test('um ponto por sessão em que o exercício foi feito, em ordem cronológica', () => {
  const pontos = historicoDoExercicio(sessoes, series, 'ex-supino', CARGA, []);
  assert.deepEqual(pontos.map((p) => p.data), ['2025-09-01', '2025-09-08', '2025-09-15']);
  assert.deepEqual(pontos.map((p) => p.cargaMaxima), [60, 62.5, 65]);
  assert.deepEqual(pontos.map((p) => p.series), [2, 1, 2]);
});

test('o volume de cada ponto é a soma de carga × reps da sessão', () => {
  const pontos = historicoDoExercicio(sessoes, series, 'ex-supino', CARGA, []);
  assert.equal(pontos[0].volume, 60 * 18);
  assert.equal(pontos[2].volume, 65 * 18);
});

test('sessão sem o exercício não vira ponto', () => {
  const pontos = historicoDoExercicio(sessoes, series, 'ex-remada', exercicios.get('ex-remada'), []);
  assert.equal(pontos.length, 1);
  assert.equal(pontos[0].data, '2025-09-15');
});

test('exercício sem histórico nenhum devolve lista vazia', () => {
  assert.deepEqual(historicoDoExercicio(sessoes, series, 'ex-novo', undefined, []), []);
});

test('aquecimento não entra nos pontos do gráfico', () => {
  const comAq = [...series, s('s2', 'ex-supino', 20, 20, true)];
  const pontos = historicoDoExercicio(sessoes, comAq, 'ex-supino', CARGA, []);
  const ponto = pontos.find((p) => p.data === '2025-09-08');
  assert.equal(ponto.series, 1, 'só a série valendo');
  assert.equal(ponto.cargaMaxima, 62.5, 'o aquecimento leve não muda a máxima');
});

test('o gráfico de assistido usa o peso corporal válido em cada data', () => {
  const pesos = [
    { data: '2025-08-01', kg: 82 },
    { data: '2025-09-10', kg: 80 },
  ];
  const seriesAssist = [s('s1', 'ex-assist', 30, 8), s('s3', 'ex-assist', 20, 8)];
  const pontos = historicoDoExercicio(sessoes, seriesAssist, 'ex-assist', ASSISTIDO, pesos);
  assert.equal(pontos[0].cargaMaxima, 82 - 30, 'em 01/09 valia o peso de agosto');
  assert.equal(pontos[1].cargaMaxima, 80 - 20, 'em 15/09 já valia o de 10/09');
});

test('sem peso corporal, o ponto de um assistido fica sem carga', () => {
  const pontos = historicoDoExercicio(sessoes, [s('s1', 'ex-assist', 30, 8)], 'ex-assist', ASSISTIDO, []);
  assert.equal(pontos[0].cargaMaxima, null);
  assert.equal(pontos[0].reps, 8, 'mas as reps continuam');
});

/* ------------------------------------------------------------------ */
/* Filtro de período                                                   */
/* ------------------------------------------------------------------ */

const pontos = [
  { data: '2025-01-15', cargaMaxima: 50 },
  { data: '2025-08-01', cargaMaxima: 60 },
  { data: '2025-09-01', cargaMaxima: 62 },
  { data: '2025-09-20', cargaMaxima: 65 },
];

test('4 semanas pega só os últimos 28 dias', () => {
  const r = filtrarPorPeriodo(pontos, PERIODO.QUATRO_SEMANAS, '2025-09-22');
  assert.deepEqual(r.map((p) => p.data), ['2025-09-01', '2025-09-20']);
});

test('3 meses pega os últimos 91 dias', () => {
  const r = filtrarPorPeriodo(pontos, PERIODO.TRES_MESES, '2025-09-22');
  assert.deepEqual(r.map((p) => p.data), ['2025-08-01', '2025-09-01', '2025-09-20']);
});

test('"tudo" não corta nada', () => {
  assert.equal(filtrarPorPeriodo(pontos, PERIODO.TUDO, '2025-09-22').length, 4);
});

test('a borda do período é inclusiva', () => {
  // 28 dias antes de 29/09 é exatamente 01/09.
  const r = filtrarPorPeriodo(pontos, PERIODO.QUATRO_SEMANAS, '2025-09-29');
  assert.ok(r.some((p) => p.data === '2025-09-01'), 'o ponto do dia exato entra');
});

/* ------------------------------------------------------------------ */
/* Resumo semanal                                                      */
/* ------------------------------------------------------------------ */

test('agrupa as sessões por semana, da mais recente para a mais antiga', () => {
  // 01/09 é segunda; 08/09 e 15/09 também. Três semanas distintas.
  const r = resumoSemanal(sessoes, series, exercicios, [], 1);
  assert.deepEqual(r.map((x) => x.semana), ['2025-09-15', '2025-09-08', '2025-09-01']);
  assert.deepEqual(r.map((x) => x.treinos), [1, 1, 1]);
});

test('duas sessões na mesma semana viram uma linha só', () => {
  const doisNaSemana = [
    { id: 'a', data: '2025-09-01', treinoNome: 'A' },
    { id: 'b', data: '2025-09-03', treinoNome: 'B' },
  ];
  const suas = [s('a', 'ex-supino', 60, 10), s('b', 'ex-supino', 60, 10)];
  const r = resumoSemanal(doisNaSemana, suas, exercicios, [], 1);
  assert.equal(r.length, 1);
  assert.equal(r[0].treinos, 2);
  assert.equal(r[0].series, 2);
  assert.equal(r[0].volume, 1200);
});

test('o volume da semana soma todos os exercícios', () => {
  const r = resumoSemanal(sessoes, series, exercicios, [], 1);
  const semana = r.find((x) => x.semana === '2025-09-15');
  assert.equal(semana.volume, 65 * 18 + 40 * 12);
  assert.equal(semana.series, 3);
});

test('o dia de início da semana muda o agrupamento', () => {
  // 07/09 é domingo, 08/09 é segunda.
  const naVirada = [
    { id: 'a', data: '2025-09-07', treinoNome: 'A' },
    { id: 'b', data: '2025-09-08', treinoNome: 'B' },
  ];
  const suas = [s('a', 'ex-supino', 60, 10), s('b', 'ex-supino', 60, 10)];

  const comSegunda = resumoSemanal(naVirada, suas, exercicios, [], 1);
  assert.equal(comSegunda.length, 2, 'começando na segunda, são duas semanas');

  const comDomingo = resumoSemanal(naVirada, suas, exercicios, [], 0);
  assert.equal(comDomingo.length, 1, 'começando no domingo, é a mesma semana');
});

test('semana sem volume conhecido fica com volume nulo, não zero', () => {
  const soAssistido = [s('s1', 'ex-assist', 30, 8)];
  const r = resumoSemanal([sessoes[0]], soAssistido, exercicios, [], 1);
  assert.equal(r[0].volume, null, 'sem peso corporal não dá para saber o volume');
  assert.equal(r[0].series, 1, 'mas a série foi feita');
});

test('sem sessão nenhuma, o resumo é vazio', () => {
  assert.deepEqual(resumoSemanal([], [], exercicios, [], 1), []);
});

/* ------------------------------------------------------------------ */
/* Lista de exercícios com histórico                                   */
/* ------------------------------------------------------------------ */

test('lista os exercícios já feitos, do mais recente para o mais antigo', () => {
  const r = exerciciosComHistorico(sessoes, series, exercicios);
  assert.deepEqual(r.map((e) => e.nome), ['Remada', 'Supino'], 'remada foi feita em 15/09');
  assert.equal(r.find((e) => e.nome === 'Supino').sessoes, 3);
});

test('exercício só com aquecimento não entra na lista', () => {
  const soAq = [s('s1', 'ex-supino', 20, 20, true)];
  assert.deepEqual(exerciciosComHistorico(sessoes, soAq, exercicios), []);
});

test('exercício apagado do cadastro ainda aparece, com nome de aviso', () => {
  const orfa = [s('s1', 'ex-sumiu', 50, 10)];
  const r = exerciciosComHistorico(sessoes, orfa, exercicios);
  assert.equal(r[0].nome, 'Exercício removido');
});

/* ------------------------------------------------------------------ */
/* Variação                                                            */
/* ------------------------------------------------------------------ */

test('variação compara o primeiro e o último ponto', () => {
  const p = historicoDoExercicio(sessoes, series, 'ex-supino', CARGA, []);
  const v = variacao(p, 'cargaMaxima');
  assert.equal(v.primeiro, 60);
  assert.equal(v.ultimo, 65);
  assert.equal(v.absoluta, 5);
  assert.ok(Math.abs(v.percentual - 8.333) < 0.01);
  assert.equal(v.dias, 14);
});

test('com menos de dois pontos não há variação a mostrar', () => {
  assert.equal(variacao([{ data: '2025-09-01', cargaMaxima: 60 }], 'cargaMaxima').absoluta, null);
  assert.equal(variacao([], 'cargaMaxima').absoluta, null);
});

test('pontos sem o campo são ignorados na variação', () => {
  const comBuraco = [
    { data: '2025-09-01', volume: null },
    { data: '2025-09-08', volume: 100 },
    { data: '2025-09-15', volume: 120 },
  ];
  const v = variacao(comBuraco, 'volume');
  assert.equal(v.primeiro, 100, 'o ponto sem volume não vira base');
  assert.equal(v.absoluta, 20);
});
