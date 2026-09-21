/**
 * Testes da comparação entre sessões (especificação, seção 6.5).
 *
 * O que mais pode dar errado aqui é o pareamento: um exercício que trocou
 * de alternativa não pode virar "removido + adicionado", e um opcional
 * pulado não pode virar "removido".
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { compararSessoes, ESTADO } from '../js/domain/comparacao.js';

const exercicios = new Map([
  ['ex-supino', { id: 'ex-supino', nome: 'Supino', tipoCarga: 'carga' }],
  ['ex-remada', { id: 'ex-remada', nome: 'Remada', tipoCarga: 'carga' }],
  ['ex-pantu', { id: 'ex-pantu', nome: 'Panturrilha', tipoCarga: 'carga' }],
  ['ex-voador', { id: 'ex-voador', nome: 'Voador inverso', tipoCarga: 'carga' }],
  ['ex-face', { id: 'ex-face', nome: 'Face pull', tipoCarga: 'carga' }],
  ['ex-barra', { id: 'ex-barra', nome: 'Barra fixa', tipoCarga: 'peso-corporal' }],
  ['ex-assist', { id: 'ex-assist', nome: 'Barra assistida', tipoCarga: 'assistido' }],
]);

/** Item de sessão. */
const item = (itemId, exercicioId, ordem, opcional = false) => ({
  itemId,
  exercicioId,
  ordem,
  opcional,
});

/** Série de sessão. */
const serie = (itemId, exercicioId, carga, reps, aquecimento = false) => ({
  itemId,
  exercicioId,
  carga,
  reps,
  aquecimento,
});

/** Monta o par de sessões para comparar. */
function comparar(itensA, seriesA, itensB, seriesB, pesoA = null, pesoB = null) {
  return compararSessoes({
    sessaoA: { id: 'a', data: '2025-09-01', itens: itensA },
    seriesA,
    sessaoB: { id: 'b', data: '2025-09-08', itens: itensB },
    seriesB,
    exercicios,
    pesoA,
    pesoB,
  });
}

/** Acha o item da comparação pelo nome mostrado. */
const achar = (r, nome) => r.itens.find((i) => i.nome === nome);
/** Acha uma linha de métrica pelo rótulo. */
const metrica = (item, rotulo) => item.metricas.find((m) => m.rotulo === rotulo);

/* ------------------------------------------------------------------ */
/* Comparação básica                                                   */
/* ------------------------------------------------------------------ */

test('mesmo exercício nas duas sessões é comparado', () => {
  const r = comparar(
    [item('i1', 'ex-supino', 0)],
    [serie('i1', 'ex-supino', 60, 10), serie('i1', 'ex-supino', 60, 8)],
    [item('i1', 'ex-supino', 0)],
    [serie('i1', 'ex-supino', 65, 10), serie('i1', 'ex-supino', 65, 8)]
  );

  const supino = achar(r, 'Supino');
  assert.equal(supino.estado, ESTADO.COMPARADO);
  assert.equal(metrica(supino, 'Carga máxima').antes, 60);
  assert.equal(metrica(supino, 'Carga máxima').depois, 65);
  assert.equal(metrica(supino, 'Carga máxima').direcao, 'melhora');
  assert.equal(metrica(supino, 'Volume').antes, 60 * 18);
  assert.equal(metrica(supino, 'Volume').depois, 65 * 18);
});

test('a tabela traz as seis métricas da especificação', () => {
  const r = comparar(
    [item('i1', 'ex-supino', 0)],
    [serie('i1', 'ex-supino', 60, 10)],
    [item('i1', 'ex-supino', 0)],
    [serie('i1', 'ex-supino', 60, 10)]
  );
  assert.deepEqual(
    achar(r, 'Supino').metricas.map((m) => m.rotulo),
    ['Carga máxima', 'Carga média', 'Volume', 'Reps totais', 'Séries', '1RM estimado']
  );
});

test('aquecimento fica fora da comparação', () => {
  const r = comparar(
    [item('i1', 'ex-supino', 0)],
    [serie('i1', 'ex-supino', 20, 20, true), serie('i1', 'ex-supino', 60, 10)],
    [item('i1', 'ex-supino', 0)],
    [serie('i1', 'ex-supino', 60, 10)]
  );
  const supino = achar(r, 'Supino');
  assert.equal(metrica(supino, 'Séries').antes, 1);
  assert.equal(metrica(supino, 'Séries').direcao, 'igual');
});

test('a posição do exercício em cada sessão aparece na comparação', () => {
  const r = comparar(
    [item('i1', 'ex-supino', 0), item('i2', 'ex-remada', 1)],
    [serie('i1', 'ex-supino', 60, 10), serie('i2', 'ex-remada', 40, 10)],
    [item('i2', 'ex-remada', 0), item('i1', 'ex-supino', 1)],
    [serie('i2', 'ex-remada', 40, 10), serie('i1', 'ex-supino', 60, 10)]
  );
  const supino = achar(r, 'Supino');
  assert.equal(supino.ordemA, 1, 'era o primeiro');
  assert.equal(supino.ordemB, 2, 'virou o segundo');
});

/* ------------------------------------------------------------------ */
/* Adicionado, removido e pulado                                       */
/* ------------------------------------------------------------------ */

test('exercício só na sessão nova é "adicionado"', () => {
  const r = comparar(
    [item('i1', 'ex-supino', 0)],
    [serie('i1', 'ex-supino', 60, 10)],
    [item('i1', 'ex-supino', 0), item('i2', 'ex-remada', 1)],
    [serie('i1', 'ex-supino', 60, 10), serie('i2', 'ex-remada', 40, 12)]
  );
  assert.equal(achar(r, 'Remada').estado, ESTADO.ADICIONADO);
  assert.equal(achar(r, 'Remada').b.series, 1);
});

test('exercício só na sessão antiga é "removido"', () => {
  const r = comparar(
    [item('i1', 'ex-supino', 0), item('i2', 'ex-remada', 1)],
    [serie('i1', 'ex-supino', 60, 10), serie('i2', 'ex-remada', 40, 12)],
    [item('i1', 'ex-supino', 0)],
    [serie('i1', 'ex-supino', 60, 10)]
  );
  assert.equal(achar(r, 'Remada').estado, ESTADO.REMOVIDO);
});

test('opcional sem série aparece como "pulado", não como removido', () => {
  const r = comparar(
    [item('i1', 'ex-supino', 0), item('i2', 'ex-pantu', 1, true)],
    [serie('i1', 'ex-supino', 60, 10), serie('i2', 'ex-pantu', 30, 15)],
    [item('i1', 'ex-supino', 0), item('i2', 'ex-pantu', 1, true)],
    [serie('i1', 'ex-supino', 60, 10)]
  );
  const pantu = achar(r, 'Panturrilha');
  assert.equal(pantu.estado, ESTADO.PULADO);
  assert.equal(pantu.opcional, true);
  assert.equal(pantu.a.series, 1, 'o que foi feito na sessão antiga continua visível');
  assert.equal(pantu.b.series, 0);
});

test('exercício não-opcional sem série é comparado com zero, não "pulado"', () => {
  const r = comparar(
    [item('i1', 'ex-supino', 0), item('i2', 'ex-remada', 1)],
    [serie('i1', 'ex-supino', 60, 10), serie('i2', 'ex-remada', 40, 12)],
    [item('i1', 'ex-supino', 0), item('i2', 'ex-remada', 1)],
    [serie('i1', 'ex-supino', 60, 10)]
  );
  const remada = achar(r, 'Remada');
  assert.equal(remada.estado, ESTADO.COMPARADO);
  assert.equal(metrica(remada, 'Séries').depois, 0);
  assert.equal(metrica(remada, 'Séries').direcao, 'piora');
});

/* ------------------------------------------------------------------ */
/* Grupos de alternativas                                              */
/* ------------------------------------------------------------------ */

test('alternativas diferentes não viram removido + adicionado', () => {
  const r = comparar(
    [item('i1', 'ex-voador', 0)],
    [serie('i1', 'ex-voador', 20, 15)],
    [item('i1', 'ex-face', 0)],
    [serie('i1', 'ex-face', 25, 15)]
  );

  assert.equal(r.itens.length, 1, 'um item só, não dois');
  const grupo = r.itens[0];
  assert.equal(grupo.estado, ESTADO.DIFERENTE);
  assert.equal(grupo.nomeA, 'Voador inverso');
  assert.equal(grupo.nomeB, 'Face pull');
  assert.equal(grupo.metricas, null, 'exercícios diferentes não se comparam');
  assert.equal(grupo.a.series, 1, 'mas o que foi feito em cada um continua visível');
  assert.equal(grupo.b.series, 1);
});

test('mesma alternativa nas duas sessões compara normalmente', () => {
  const r = comparar(
    [item('i1', 'ex-voador', 0)],
    [serie('i1', 'ex-voador', 20, 15)],
    [item('i1', 'ex-voador', 0)],
    [serie('i1', 'ex-voador', 25, 15)]
  );
  assert.equal(r.itens[0].estado, ESTADO.COMPARADO);
  assert.equal(metrica(r.itens[0], 'Carga máxima').direcao, 'melhora');
});

test('exercício avulso pareia pelo exercício quando o itemId não bate', () => {
  // O mesmo exercício adicionado na mão em cada sessão ganha itemId próprio.
  const r = comparar(
    [item('avulso-1', 'ex-remada', 0)],
    [serie('avulso-1', 'ex-remada', 40, 10)],
    [item('avulso-2', 'ex-remada', 0)],
    [serie('avulso-2', 'ex-remada', 45, 10)]
  );
  assert.equal(r.itens.length, 1);
  assert.equal(r.itens[0].estado, ESTADO.COMPARADO);
  assert.equal(metrica(r.itens[0], 'Carga máxima').depois, 45);
});

/* ------------------------------------------------------------------ */
/* Peso corporal e assistido                                           */
/* ------------------------------------------------------------------ */

test('assistido compara pela carga efetiva: menos assistência é melhora', () => {
  const r = comparar(
    [item('i1', 'ex-assist', 0)],
    [serie('i1', 'ex-assist', 30, 8)],
    [item('i1', 'ex-assist', 0)],
    [serie('i1', 'ex-assist', 20, 8)],
    80,
    80
  );
  const assist = achar(r, 'Barra assistida');
  assert.equal(metrica(assist, 'Carga máxima').antes, 50, '80 - 30');
  assert.equal(metrica(assist, 'Carga máxima').depois, 60, '80 - 20');
  assert.equal(metrica(assist, 'Carga máxima').direcao, 'melhora');
});

test('peso corporal soma a anilha ao peso do dia', () => {
  const r = comparar(
    [item('i1', 'ex-barra', 0)],
    [serie('i1', 'ex-barra', 0, 8)],
    [item('i1', 'ex-barra', 0)],
    [serie('i1', 'ex-barra', 10, 8)],
    80,
    79
  );
  const barra = achar(r, 'Barra fixa');
  assert.equal(metrica(barra, 'Carga máxima').antes, 80);
  assert.equal(metrica(barra, 'Carga máxima').depois, 89, '79 + 10');
});

test('sem peso corporal, compara só reps, séries e o kg registrado', () => {
  const r = comparar(
    [item('i1', 'ex-assist', 0)],
    [serie('i1', 'ex-assist', 30, 8)],
    [item('i1', 'ex-assist', 0)],
    [serie('i1', 'ex-assist', 20, 8)],
    null,
    null
  );
  const assist = achar(r, 'Barra assistida');
  assert.deepEqual(
    assist.metricas.map((m) => m.rotulo),
    ['Séries', 'Reps totais', 'Assistência']
  );
  const a = metrica(assist, 'Assistência');
  assert.equal(a.antes, 30);
  assert.equal(a.depois, 20);
  assert.equal(a.direcao, 'melhora', 'menos assistência é progresso');
  assert.equal(r.semPesoCorporal, true);
});

test('sem peso corporal, peso corporal compara a carga adicional, onde mais é melhor', () => {
  const r = comparar(
    [item('i1', 'ex-barra', 0)],
    [serie('i1', 'ex-barra', 5, 8)],
    [item('i1', 'ex-barra', 0)],
    [serie('i1', 'ex-barra', 10, 8)],
    null,
    null
  );
  const barra = achar(r, 'Barra fixa');
  const adicional = metrica(barra, 'Carga adicional');
  assert.equal(adicional.antes, 5);
  assert.equal(adicional.depois, 10);
  assert.equal(adicional.direcao, 'melhora');
});

test('peso corporal em só uma das sessões ainda cai no modo sem peso', () => {
  const r = comparar(
    [item('i1', 'ex-assist', 0)],
    [serie('i1', 'ex-assist', 30, 8)],
    [item('i1', 'ex-assist', 0)],
    [serie('i1', 'ex-assist', 20, 8)],
    null,
    80
  );
  assert.deepEqual(
    achar(r, 'Barra assistida').metricas.map((m) => m.rotulo),
    ['Séries', 'Reps totais', 'Assistência']
  );
});

/* ------------------------------------------------------------------ */
/* Total da sessão                                                     */
/* ------------------------------------------------------------------ */

test('o total soma todos os exercícios das duas sessões', () => {
  const r = comparar(
    [item('i1', 'ex-supino', 0), item('i2', 'ex-remada', 1)],
    [serie('i1', 'ex-supino', 60, 10), serie('i2', 'ex-remada', 40, 10)],
    [item('i1', 'ex-supino', 0), item('i2', 'ex-remada', 1)],
    [serie('i1', 'ex-supino', 65, 10), serie('i2', 'ex-remada', 45, 10)]
  );

  const volume = r.total.metricas.find((m) => m.rotulo === 'Volume');
  assert.equal(volume.antes, 60 * 10 + 40 * 10);
  assert.equal(volume.depois, 65 * 10 + 45 * 10);
  assert.equal(volume.direcao, 'melhora');

  const series = r.total.metricas.find((m) => m.rotulo === 'Séries');
  assert.equal(series.antes, 2);
  assert.equal(series.depois, 2);
});

test('o total inclui exercícios que só existem numa das sessões', () => {
  const r = comparar(
    [item('i1', 'ex-supino', 0)],
    [serie('i1', 'ex-supino', 60, 10)],
    [item('i1', 'ex-supino', 0), item('i2', 'ex-remada', 1)],
    [serie('i1', 'ex-supino', 60, 10), serie('i2', 'ex-remada', 40, 10)]
  );
  const volume = r.total.metricas.find((m) => m.rotulo === 'Volume');
  assert.equal(volume.antes, 600);
  assert.equal(volume.depois, 600 + 400, 'o exercício novo entra no total');
});

test('comparar duas sessões vazias não quebra', () => {
  const r = comparar([], [], [], []);
  assert.deepEqual(r.itens, []);
  assert.equal(r.total.a.series, 0);
  assert.equal(r.total.metricas.find((m) => m.rotulo === 'Volume').direcao, '—');
});

test('sessão idêntica dá tudo igual', () => {
  const itens = [item('i1', 'ex-supino', 0)];
  const series = [serie('i1', 'ex-supino', 60, 10)];
  const r = comparar(itens, series, itens, series);
  achar(r, 'Supino').metricas.forEach((m) => {
    assert.equal(m.direcao, 'igual', m.rotulo);
    assert.equal(m.absoluta, 0, m.rotulo);
  });
});

/* ------------------------------------------------------------------ */
/* Substituir um exercício mantendo a vaga no treino                   */
/* ------------------------------------------------------------------ */

test('substituir mantém a vaga: um item só, marcado como diferente', () => {
  // Mesmo itemId nas duas sessões, exercícios diferentes, sem alternativas.
  const r = comparar(
    [item('i1', 'ex-supino', 0)],
    [serie('i1', 'ex-supino', 60, 10)],
    [{ ...item('i1', 'ex-pantu', 0), substituido: true }],
    [serie('i1', 'ex-pantu', 30, 15)]
  );

  assert.equal(r.itens.length, 1, 'não vira um removido e um adicionado');
  assert.equal(r.itens[0].estado, ESTADO.DIFERENTE);
  assert.equal(r.itens[0].nomeA, 'Supino');
  assert.equal(r.itens[0].nomeB, 'Panturrilha');
  assert.equal(r.itens[0].eraGrupo, false, 'foi substituição, não alternativa');
});

test('um grupo de alternativas se identifica como grupo', () => {
  const r = comparar(
    [{ ...item('i1', 'ex-voador', 0), alternativas: ['ex-voador', 'ex-face'] }],
    [serie('i1', 'ex-voador', 20, 15)],
    [{ ...item('i1', 'ex-face', 0), alternativas: ['ex-voador', 'ex-face'] }],
    [serie('i1', 'ex-face', 25, 15)]
  );
  assert.equal(r.itens[0].eraGrupo, true, 'a tela escreve "alternativa diferente"');
});

test('remover e adicionar continua sendo removido + adicionado', () => {
  // Sem substituir: o item some e outro nasce com itemId próprio.
  const r = comparar(
    [item('i1', 'ex-supino', 0)],
    [serie('i1', 'ex-supino', 60, 10)],
    [item('i-novo', 'ex-pantu', 0)],
    [serie('i-novo', 'ex-pantu', 30, 15)]
  );
  assert.deepEqual(
    r.itens.map((i) => [i.nome, i.estado]),
    [
      ['Supino', ESTADO.REMOVIDO],
      ['Panturrilha', ESTADO.ADICIONADO],
    ]
  );
});

/* ------------------------------------------------------------------ */
/* Avisos de dados que faltam                                          */
/* ------------------------------------------------------------------ */

test('a comparação separa as três causas de dado faltando', () => {
  const r = comparar(
    [item('i1', 'ex-supino', 0), item('i2', 'ex-assist', 1)],
    [serie('i1', 'ex-supino', null, 10), serie('i2', 'ex-assist', 30, 8)],
    [item('i1', 'ex-supino', 0), item('i2', 'ex-assist', 1)],
    [serie('i1', 'ex-supino', 60, null), serie('i2', 'ex-assist', 20, 8)]
  );

  assert.equal(r.faltando.carga, 1, 'uma série sem kg, na sessão antiga');
  assert.equal(r.faltando.reps, 1, 'uma série sem reps, na nova');
  assert.equal(r.faltando.pesoCorporal, 2, 'as duas do assistido, sem peso registrado');
  assert.equal(r.semPesoCorporal, true);
});

test('sem nada faltando, não há aviso', () => {
  const r = comparar(
    [item('i1', 'ex-supino', 0)],
    [serie('i1', 'ex-supino', 60, 10)],
    [item('i1', 'ex-supino', 0)],
    [serie('i1', 'ex-supino', 65, 10)]
  );
  assert.deepEqual(r.faltando, { pesoCorporal: 0, carga: 0, reps: 0 });
  assert.equal(r.semPesoCorporal, false);
});

test('reps em branco não fazem o volume despencar na comparação', () => {
  const r = comparar(
    [item('i1', 'ex-supino', 0)],
    [serie('i1', 'ex-supino', 60, 10), serie('i1', 'ex-supino', 60, 10)],
    [item('i1', 'ex-supino', 0)],
    [serie('i1', 'ex-supino', 60, 10), serie('i1', 'ex-supino', 60, null)]
  );
  const volume = metrica(achar(r, 'Supino'), 'Volume');
  assert.equal(volume.antes, 1200);
  assert.equal(volume.depois, 600, 'conta só a série completa');
  assert.equal(r.faltando.reps, 1, 'e avisa que o número está incompleto');

  const series = metrica(achar(r, 'Supino'), 'Séries');
  assert.equal(series.depois, 2, 'as duas séries foram feitas');
});
