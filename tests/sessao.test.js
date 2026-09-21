/**
 * Testes das regras puras da sessão: montagem a partir do modelo,
 * busca da última vez de um exercício e pré-preenchimento das séries.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  montarSessao,
  itemDaSessao,
  ultimaVezDoExercicio,
  valoresIniciaisDaSerie,
  renumerar,
  ordenarSeries,
  proximoNumero,
  alternarAquecimento,
  moverItem,
} from '../js/domain/sessao.js';
import { STATUS } from '../js/utils/constantes.js';

const treino = {
  id: 'tr-a',
  nome: 'A',
  naRotacao: true,
  cor: '#4f8cff',
  itens: [
    {
      id: 'it-1',
      tipo: 'exercicio',
      exercicioId: 'ex-supino',
      seriesPlanejadas: 4,
      repsPlanejadas: 10,
      opcional: false,
    },
    {
      id: 'it-2',
      tipo: 'alternativas',
      nome: 'Voador inverso ou face pull',
      alternativas: ['ex-voador', 'ex-face-pull'],
      exercicioPadraoId: 'ex-voador',
      seriesPlanejadas: 3,
      repsPlanejadas: null,
      opcional: true,
    },
  ],
};

test('montarSessao copia o modelo e começa em andamento', () => {
  const s = montarSessao({ id: 'ses-1', data: '2025-09-22', treino, agora: 1000 });
  assert.equal(s.status, STATUS.EM_ANDAMENTO);
  assert.equal(s.data, '2025-09-22');
  assert.equal(s.treinoId, 'tr-a');
  assert.equal(s.itens.length, 2);
  assert.equal(s.finalizadaEm, null);
  assert.deepEqual(s.modelo.itens, treino.itens);
});

test('a cópia do modelo é independente do modelo original', () => {
  const s = montarSessao({ id: 'ses-1', data: '2025-09-22', treino });
  s.modelo.itens[0].seriesPlanejadas = 99;
  assert.equal(treino.itens[0].seriesPlanejadas, 4, 'editar a sessão não mexe no modelo');
});

test('sessão retroativa entra já finalizada', () => {
  const s = montarSessao({
    id: 'ses-2',
    data: '2025-09-01',
    treino,
    finalizada: true,
    agora: 5000,
  });
  assert.equal(s.status, STATUS.FINALIZADA);
  assert.equal(s.finalizadaEm, 5000);
});

test('grupo de alternativas começa na alternativa padrão', () => {
  const item = itemDaSessao(treino.itens[1], 1);
  assert.equal(item.exercicioId, 'ex-voador');
  assert.deepEqual(item.alternativas, ['ex-voador', 'ex-face-pull']);
  assert.equal(item.opcional, true);
});

/* ---- última vez / pré-preenchimento ---- */

const sessoes = [
  { id: 's1', data: '2025-09-01', criadaEm: 1 },
  { id: 's2', data: '2025-09-08', criadaEm: 2 },
  { id: 's3', data: '2025-09-15', criadaEm: 3 },
];

const series = [
  { id: 'a1', sessaoId: 's1', exercicioId: 'ex-supino', numero: 1, carga: 50, reps: 10, aquecimento: false },
  { id: 'a2', sessaoId: 's2', exercicioId: 'ex-supino', numero: 1, carga: 55, reps: 10, aquecimento: false },
  { id: 'a3', sessaoId: 's2', exercicioId: 'ex-supino', numero: 2, carga: 55, reps: 9, aquecimento: false },
  { id: 'a4', sessaoId: 's3', exercicioId: 'ex-supino', numero: 1, carga: 60, reps: 8, aquecimento: false },
  { id: 'b1', sessaoId: 's3', exercicioId: 'ex-remada', numero: 1, carga: 40, reps: 12, aquecimento: false },
];

test('ultimaVezDoExercicio pega a sessão mais recente até a data', () => {
  const r = ultimaVezDoExercicio(sessoes, series, 'ex-supino', '2025-09-20');
  assert.equal(r.sessao.id, 's3');
  assert.equal(r.series.length, 1);
  assert.equal(r.series[0].carga, 60);
});

test('numa sessão retroativa, vale a última sessão ANTERIOR à data escolhida', () => {
  const r = ultimaVezDoExercicio(sessoes, series, 'ex-supino', '2025-09-10');
  assert.equal(r.sessao.id, 's2', 'ignora a sessão de 15/09, posterior à data');
  assert.equal(r.series.length, 2);
});

test('ultimaVezDoExercicio ignora a própria sessão', () => {
  const r = ultimaVezDoExercicio(sessoes, series, 'ex-supino', '2025-09-15', 's3');
  assert.equal(r.sessao.id, 's2');
});

test('ultimaVezDoExercicio devolve null quando não há histórico', () => {
  assert.equal(ultimaVezDoExercicio(sessoes, series, 'ex-novo', '2025-09-20'), null);
  assert.equal(ultimaVezDoExercicio(sessoes, series, 'ex-supino', '2025-08-01'), null);
});

test('primeira série repete a primeira série da última vez', () => {
  const item = itemDaSessao(treino.itens[0], 0);
  const anterior = ultimaVezDoExercicio(sessoes, series, 'ex-supino', '2025-09-20');
  assert.deepEqual(valoresIniciaisDaSerie(item, [], anterior), { carga: 60, reps: 8 });
});

test('sem histórico, usa as reps planejadas e carga em branco', () => {
  const item = itemDaSessao(treino.itens[0], 0);
  assert.deepEqual(valoresIniciaisDaSerie(item, [], null), { carga: null, reps: 10 });
});

test('sem histórico e sem reps planejadas, tudo em branco', () => {
  const item = itemDaSessao(treino.itens[1], 1);
  assert.deepEqual(valoresIniciaisDaSerie(item, [], null), { carga: null, reps: null });
});

test('cada série repete a série de mesmo número da última vez', () => {
  // Última vez: 14×12 na primeira, 16×8 na segunda, 16×6 na terceira.
  const item = itemDaSessao(treino.itens[0], 0);
  const anterior = {
    series: [
      { numero: 1, carga: 14, reps: 12, aquecimento: false },
      { numero: 2, carga: 16, reps: 8, aquecimento: false },
      { numero: 3, carga: 16, reps: 6, aquecimento: false },
    ],
  };
  const atuais = [];
  const esperado = [
    { carga: 14, reps: 12 },
    { carga: 16, reps: 8 },
    { carga: 16, reps: 6 },
  ];
  esperado.forEach((valores, i) => {
    assert.deepEqual(
      valoresIniciaisDaSerie(item, atuais, anterior),
      valores,
      `série ${i + 1}`
    );
    atuais.push({ ...valores, numero: i + 1, aquecimento: false });
  });
});

test('passando do número de séries da última vez, repete a última desta sessão', () => {
  const item = itemDaSessao(treino.itens[0], 0);
  const anterior = { series: [{ numero: 1, carga: 60, reps: 8, aquecimento: false }] };
  const atuais = [{ numero: 1, carga: 62.5, reps: 9, aquecimento: false }];
  assert.deepEqual(valoresIniciaisDaSerie(item, atuais, anterior), {
    carga: 62.5,
    reps: 9,
  });
});

test('aquecimento e série valendo não se misturam no pré-preenchimento', () => {
  const item = itemDaSessao(treino.itens[0], 0);
  const anterior = {
    series: [
      { numero: 1, carga: 20, reps: 15, aquecimento: true },
      { numero: 1, carga: 60, reps: 8, aquecimento: false },
    ],
  };
  assert.deepEqual(
    valoresIniciaisDaSerie(item, [], anterior, false),
    { carga: 60, reps: 8 },
    'a série valendo ignora o aquecimento da última vez'
  );
  assert.deepEqual(
    valoresIniciaisDaSerie(item, [], anterior, true),
    { carga: 20, reps: 15 },
    'o aquecimento repete o aquecimento da última vez'
  );
});

test('aquecimento já feito nesta sessão não serve de base para a série valendo', () => {
  const item = itemDaSessao(treino.itens[0], 0);
  const atuais = [{ numero: 1, carga: 20, reps: 15, aquecimento: true }];
  assert.deepEqual(valoresIniciaisDaSerie(item, atuais, null), { carga: null, reps: 10 });
});

/* ---- aquecimento: ordem e numeração ---- */

test('proximoNumero conta cada categoria separadamente', () => {
  const doItem = [
    { numero: 1, aquecimento: true },
    { numero: 1, aquecimento: false },
    { numero: 2, aquecimento: false },
  ];
  assert.equal(proximoNumero(doItem, false), 3);
  assert.equal(proximoNumero(doItem, true), 2);
});

test('aquecimento vem sempre antes das séries valendo', () => {
  const misturadas = [
    { id: 'c', numero: 2, aquecimento: false, ordemItem: 0 },
    { id: 'a', numero: 1, aquecimento: true, ordemItem: 0 },
    { id: 'b', numero: 1, aquecimento: false, ordemItem: 0 },
    { id: 'd', numero: 1, aquecimento: false, ordemItem: 1 },
  ];
  assert.deepEqual(
    ordenarSeries(misturadas).map((s) => s.id),
    ['a', 'b', 'c', 'd'],
    'primeiro por exercício, depois aquecimento, depois número'
  );
});

test('renumerar usa sequências separadas para aquecimento e séries valendo', () => {
  const r = renumerar([
    { id: 'a', numero: 5, aquecimento: false },
    { id: 'b', numero: 2, aquecimento: true },
    { id: 'c', numero: 9, aquecimento: false },
    { id: 'd', numero: 7, aquecimento: true },
  ]);
  assert.deepEqual(
    r.map((s) => [s.id, s.aquecimento ? 'aq' : 'ok', s.numero]),
    [
      ['b', 'aq', 1],
      ['d', 'aq', 2],
      ['a', 'ok', 1],
      ['c', 'ok', 2],
    ]
  );
});

test('renumerar deixa os números sequenciais a partir de 1', () => {
  const r = renumerar([{ numero: 2 }, { numero: 3 }, { numero: 5 }]);
  assert.deepEqual(r.map((s) => s.numero), [1, 2, 3]);
});

test('marcar como aquecimento move a série para o começo e renumera', () => {
  const doItem = [
    { id: 's1', numero: 1, aquecimento: false },
    { id: 's2', numero: 2, aquecimento: false },
    { id: 's3', numero: 3, aquecimento: false },
  ];
  const r = alternarAquecimento(doItem, 's3');
  assert.deepEqual(
    r.map((s) => [s.id, s.aquecimento ? 'aq' : 'ok', s.numero]),
    [
      ['s3', 'aq', 1],
      ['s1', 'ok', 1],
      ['s2', 'ok', 2],
    ]
  );
});

test('desmarcar aquecimento devolve a série ao grupo das que valem', () => {
  const doItem = [
    { id: 'aq1', numero: 1, aquecimento: true },
    { id: 's1', numero: 1, aquecimento: false },
  ];
  const r = alternarAquecimento(doItem, 'aq1');
  assert.deepEqual(
    r.map((s) => [s.id, s.aquecimento ? 'aq' : 'ok', s.numero]),
    [
      ['aq1', 'ok', 1],
      ['s1', 'ok', 2],
    ]
  );
});

/* ---- ordem dos exercícios na sessão ---- */

const itensDaSessao = [
  { itemId: 'i1', ordem: 0 },
  { itemId: 'i2', ordem: 1 },
  { itemId: 'i3', ordem: 2 },
];

test('moverItem sobe e desce um exercício, recalculando a ordem', () => {
  assert.deepEqual(
    moverItem(itensDaSessao, 'i3', -1).map((i) => [i.itemId, i.ordem]),
    [
      ['i1', 0],
      ['i3', 1],
      ['i2', 2],
    ]
  );
  assert.deepEqual(
    moverItem(itensDaSessao, 'i1', 1).map((i) => i.itemId),
    ['i2', 'i1', 'i3']
  );
});

test('moverItem devolve null nas pontas e para item inexistente', () => {
  assert.equal(moverItem(itensDaSessao, 'i1', -1), null);
  assert.equal(moverItem(itensDaSessao, 'i3', 1), null);
  assert.equal(moverItem(itensDaSessao, 'nao-existe', 1), null);
});

test('moverItem não altera a lista original', () => {
  moverItem(itensDaSessao, 'i1', 1);
  assert.deepEqual(
    itensDaSessao.map((i) => [i.itemId, i.ordem]),
    [
      ['i1', 0],
      ['i2', 1],
      ['i3', 2],
    ]
  );
});
