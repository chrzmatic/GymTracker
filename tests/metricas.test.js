/**
 * Testes das métricas de série: carga efetiva, volume, 1RM e diferenças.
 *
 * O ponto delicado é a carga efetiva. Um exercício assistido com 30 kg de
 * assistência e outro com 20 kg não são "30 contra 20": são 50 contra 60
 * de carga efetiva para quem pesa 80 kg. Errar isso inverteria o sinal do
 * progresso na tela.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pesoCorporalEm,
  cargaEfetiva,
  epley,
  metricasDeSeries,
  metricasVazias,
  somarMetricas,
  diferenca,
} from '../js/domain/metricas.js';

const CARGA = { id: 'ex-supino', nome: 'Supino', tipoCarga: 'carga' };
const CORPORAL = { id: 'ex-barra', nome: 'Barra fixa', tipoCarga: 'peso-corporal' };
const ASSISTIDO = { id: 'ex-assist', nome: 'Barra assistida', tipoCarga: 'assistido' };

/** Série de teste. */
const s = (carga, reps, aquecimento = false) => ({ carga, reps, aquecimento });

/* ------------------------------------------------------------------ */
/* Peso corporal na data                                               */
/* ------------------------------------------------------------------ */

const pesos = [
  { data: '2025-08-01', kg: 82 },
  { data: '2025-09-01', kg: 80 },
  { data: '2025-09-15', kg: 79 },
];

test('pesoCorporalEm pega o registro mais recente até a data', () => {
  assert.equal(pesoCorporalEm(pesos, '2025-09-10'), 80);
  assert.equal(pesoCorporalEm(pesos, '2025-09-15'), 79, 'a data do registro conta');
  assert.equal(pesoCorporalEm(pesos, '2025-12-01'), 79, 'depois do último, vale o último');
  assert.equal(pesoCorporalEm(pesos, '2025-08-15'), 82);
});

test('pesoCorporalEm devolve null antes do primeiro registro', () => {
  assert.equal(pesoCorporalEm(pesos, '2025-07-31'), null);
  assert.equal(pesoCorporalEm([], '2025-09-10'), null);
});

/* ------------------------------------------------------------------ */
/* Carga efetiva por tipo                                              */
/* ------------------------------------------------------------------ */

test('carga: a efetiva é o kg registrado, e o peso corporal não interfere', () => {
  assert.equal(cargaEfetiva(s(60, 10), CARGA, 80), 60);
  assert.equal(cargaEfetiva(s(60, 10), CARGA, null), 60);
});

test('carga sem kg registrado não tem carga efetiva', () => {
  assert.equal(cargaEfetiva(s(null, 10), CARGA, 80), null);
});

test('peso corporal: soma o peso ao kg adicional', () => {
  assert.equal(cargaEfetiva(s(10, 8), CORPORAL, 80), 90);
  assert.equal(cargaEfetiva(s(null, 8), CORPORAL, 80), 80, 'sem anilha, é o próprio peso');
  assert.equal(cargaEfetiva(s(0, 8), CORPORAL, 80), 80);
});

test('assistido: subtrai a assistência do peso corporal', () => {
  assert.equal(cargaEfetiva(s(30, 8), ASSISTIDO, 80), 50);
  assert.equal(cargaEfetiva(s(20, 8), ASSISTIDO, 80), 60, 'menos assistência, mais carga');
});

test('sem peso corporal, peso corporal e assistido ficam sem carga efetiva', () => {
  assert.equal(cargaEfetiva(s(10, 8), CORPORAL, null), null);
  assert.equal(cargaEfetiva(s(30, 8), ASSISTIDO, null), null);
});

/* ------------------------------------------------------------------ */
/* Epley                                                               */
/* ------------------------------------------------------------------ */

test('epley: carga × (1 + reps / 30)', () => {
  assert.equal(epley(100, 0), 100, 'uma repetição máxima é a própria carga');
  assert.equal(epley(60, 10), 80);
  assert.equal(epley(90, 5), 105);
  assert.equal(epley(null, 10), null);
  assert.equal(epley(60, null), null);
});

/* ------------------------------------------------------------------ */
/* Métricas de um exercício                                            */
/* ------------------------------------------------------------------ */

test('métricas de um exercício de carga', () => {
  const m = metricasDeSeries([s(60, 10), s(65, 8), s(65, 6)], CARGA, null);
  assert.equal(m.series, 3);
  assert.equal(m.reps, 24);
  assert.equal(m.volume, 60 * 10 + 65 * 8 + 65 * 6, 'soma de carga × reps');
  assert.equal(m.cargaMaxima, 65);
  assert.equal(m.rm, Math.max(epley(60, 10), epley(65, 8), epley(65, 6)));
  assert.equal(m.semCargaEfetiva, false);
});

test('a carga média é ponderada pelas reps, não a média simples', () => {
  // 100 kg × 1 rep e 50 kg × 9 reps. Média simples seria 75.
  const m = metricasDeSeries([s(100, 1), s(50, 9)], CARGA, null);
  assert.equal(m.cargaMedia, (100 * 1 + 50 * 9) / 10);
  assert.equal(m.cargaMedia, 55);
});

test('aquecimento fica fora de todas as contas', () => {
  const comAq = metricasDeSeries([s(20, 15, true), s(60, 10), s(60, 8)], CARGA, null);
  const semAq = metricasDeSeries([s(60, 10), s(60, 8)], CARGA, null);
  assert.deepEqual(comAq, semAq);
  assert.equal(comAq.series, 2);
});

test('exercício sem série nenhuma devolve métricas vazias', () => {
  const m = metricasDeSeries([], CARGA, null);
  assert.equal(m.series, 0);
  assert.equal(m.volume, null);
  assert.equal(m.cargaMaxima, null);
  assert.equal(m.semCargaEfetiva, false, 'sem série não é "sem carga efetiva"');
});

test('só aquecimento conta como exercício não feito', () => {
  const m = metricasDeSeries([s(20, 15, true)], CARGA, null);
  assert.equal(m.series, 0);
  assert.equal(m.volume, null);
});

test('métricas de assistido usam a carga efetiva, invertendo o sentido', () => {
  const antes = metricasDeSeries([s(30, 8)], ASSISTIDO, 80);
  const depois = metricasDeSeries([s(20, 8)], ASSISTIDO, 80);
  assert.equal(antes.cargaMaxima, 50);
  assert.equal(depois.cargaMaxima, 60);
  assert.ok(depois.volume > antes.volume, 'menos assistência dá mais volume efetivo');
});

test('sem peso corporal, as métricas de carga somem mas reps e séries ficam', () => {
  const m = metricasDeSeries([s(30, 8), s(30, 6)], ASSISTIDO, null);
  assert.equal(m.series, 2);
  assert.equal(m.reps, 14);
  assert.equal(m.volume, null);
  assert.equal(m.cargaMaxima, null);
  assert.equal(m.semCargaEfetiva, true, 'a flag avisa que o número está incompleto');
  assert.equal(m.cargaRegistradaMaxima, 30, 'a assistência registrada continua disponível');
});

test('uma série sem carga no meio marca o conjunto como incompleto', () => {
  const m = metricasDeSeries([s(60, 10), s(null, 8)], CARGA, null);
  assert.equal(m.series, 2);
  assert.equal(m.reps, 18);
  assert.equal(m.volume, 600, 'só a série com carga entra no volume');
  assert.equal(m.semCargaEfetiva, true);
});

/* ------------------------------------------------------------------ */
/* Total da sessão                                                     */
/* ------------------------------------------------------------------ */

test('somarMetricas junta séries, reps e volume', () => {
  const a = metricasDeSeries([s(60, 10), s(60, 10)], CARGA, null);
  const b = metricasDeSeries([s(40, 12)], CARGA, null);
  const total = somarMetricas([a, b]);
  assert.equal(total.series, 3);
  assert.equal(total.reps, 32);
  assert.equal(total.volume, 60 * 20 + 40 * 12);
});

test('a carga média do total é ponderada pelas reps de todos os exercícios', () => {
  const a = metricasDeSeries([s(100, 10)], CARGA, null); // 1000 em 10 reps
  const b = metricasDeSeries([s(50, 10)], CARGA, null); // 500 em 10 reps
  const total = somarMetricas([a, b]);
  assert.equal(total.volume, 1500);
  assert.equal(total.cargaMedia, 75);
});

test('somarMetricas de nada devolve zeros', () => {
  const total = somarMetricas([]);
  assert.equal(total.series, 0);
  assert.equal(total.volume, null);
  assert.equal(total.cargaMedia, null);
});

test('a flag de carga incompleta sobe para o total', () => {
  const ok = metricasDeSeries([s(60, 10)], CARGA, null);
  const incompleto = metricasDeSeries([s(30, 8)], ASSISTIDO, null);
  assert.equal(somarMetricas([ok, incompleto]).semCargaEfetiva, true);
  assert.equal(somarMetricas([ok]).semCargaEfetiva, false);
});

test('metricasVazias é neutra na soma', () => {
  const a = metricasDeSeries([s(60, 10)], CARGA, null);
  assert.deepEqual(somarMetricas([a, metricasVazias()]), somarMetricas([a]));
});

/* ------------------------------------------------------------------ */
/* Diferenças                                                          */
/* ------------------------------------------------------------------ */

test('diferença calcula absoluta, percentual e direção', () => {
  const d = diferenca(100, 110);
  assert.equal(d.absoluta, 10);
  assert.equal(d.percentual, 10);
  assert.equal(d.direcao, 'melhora');
});

test('diferença para baixo é piora, e igual é igual', () => {
  assert.equal(diferenca(100, 90).direcao, 'piora');
  assert.equal(diferenca(100, 90).absoluta, -10);
  assert.equal(diferenca(100, 100).direcao, 'igual');
  assert.equal(diferenca(100, 100).percentual, 0);
});

test('com maiorEhMelhor falso, menos é progresso', () => {
  assert.equal(diferenca(30, 20, false).direcao, 'melhora', 'menos assistência');
  assert.equal(diferenca(20, 30, false).direcao, 'piora');
});

test('diferença com valor faltando não inventa número', () => {
  const d = diferenca(null, 100);
  assert.equal(d.absoluta, null);
  assert.equal(d.percentual, null);
  assert.equal(d.direcao, '—');
  assert.equal(diferenca(100, null).direcao, '—');
});

test('percentual sobre zero fica indefinido em vez de infinito', () => {
  const d = diferenca(0, 50);
  assert.equal(d.absoluta, 50);
  assert.equal(d.percentual, null, 'dividir por zero daria Infinity');
  assert.equal(d.direcao, 'melhora');
});

/* ------------------------------------------------------------------ */
/* Reps em branco: "não contei", não "não fiz"                         */
/* ------------------------------------------------------------------ */

test('série com carga e sem reps não vira volume zero', () => {
  const m = metricasDeSeries([s(60, null)], CARGA, null);
  assert.equal(m.series, 1, 'a série foi feita');
  assert.equal(m.cargaMaxima, 60, 'e a carga é conhecida');
  assert.equal(m.volume, null, 'mas o volume é desconhecido, não zero');
  assert.equal(m.rm, null, 'sem reps não dá para estimar 1RM');
  assert.equal(m.semReps, true, 'e o app avisa');
  assert.equal(m.faltando.reps, 1);
});

test('reps em branco não somam zero no total de reps', () => {
  const m = metricasDeSeries([s(60, 10), s(60, null)], CARGA, null);
  assert.equal(m.reps, 10, 'só as reps conhecidas');
  assert.equal(m.series, 2, 'mas as duas séries foram feitas');
  assert.equal(m.volume, 600, 'o volume conta só a série completa');
  assert.equal(m.semReps, true);
});

test('a carga máxima considera séries sem reps', () => {
  // A série mais pesada do dia não deixa de ser a mais pesada por eu não
  // ter contado as reps dela.
  const m = metricasDeSeries([s(60, 10), s(80, null)], CARGA, null);
  assert.equal(m.cargaMaxima, 80);
});

test('as três faltas são contadas separadamente', () => {
  const m = metricasDeSeries([s(null, 10), s(60, null), s(60, 10)], CARGA, null);
  assert.deepEqual(m.faltando, { carga: 1, pesoCorporal: 0, reps: 1 });
  assert.equal(m.semCargaEfetiva, true, 'falta o kg de uma');
  assert.equal(m.semReps, true, 'e as reps de outra');
});

test('falta de peso corporal é contada à parte da falta de carga', () => {
  const semPeso = metricasDeSeries([s(30, 8)], ASSISTIDO, null);
  assert.deepEqual(semPeso.faltando, { carga: 0, pesoCorporal: 1, reps: 0 });

  const semCarga = metricasDeSeries([s(null, 8)], CARGA, null);
  assert.deepEqual(semCarga.faltando, { carga: 1, pesoCorporal: 0, reps: 0 });
});

test('a média ponderada ignora séries sem reps em vez de distorcer', () => {
  const m = metricasDeSeries([s(100, 10), s(50, null)], CARGA, null);
  assert.equal(m.cargaMedia, 100, 'a série sem reps não entra na ponderação');
});

test('somarMetricas junta as faltas de todos os exercícios', () => {
  const a = metricasDeSeries([s(60, null)], CARGA, null);
  const b = metricasDeSeries([s(null, 10)], CARGA, null);
  const total = somarMetricas([a, b]);
  assert.deepEqual(total.faltando, { carga: 1, pesoCorporal: 0, reps: 1 });
  assert.equal(total.semReps, true);
  assert.equal(total.semCargaEfetiva, true);
});

test('sessão completa não levanta aviso nenhum', () => {
  const m = metricasDeSeries([s(60, 10), s(60, 8)], CARGA, null);
  assert.deepEqual(m.faltando, { carga: 0, pesoCorporal: 0, reps: 0 });
  assert.equal(m.semReps, false);
  assert.equal(m.semCargaEfetiva, false);
});
