/** Testes do resumo de sessão e do texto copiado, conferido linha a linha. */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resumirSessao,
  textoDaSerie,
  textoParaCopiar,
  textoDosTotais,
} from '../js/domain/resumo-sessao.js';
import { STATUS, TIPOS_CARGA } from '../js/utils/constantes.js';

const exercicios = new Map([
  [
    'ex-supino',
    { id: 'ex-supino', nome: 'Supino reto máquina', tipoCarga: TIPOS_CARGA.CARGA },
  ],
  [
    'ex-barra',
    { id: 'ex-barra', nome: 'Barra fixa', tipoCarga: TIPOS_CARGA.PESO_CORPORAL },
  ],
  [
    'ex-paralela',
    { id: 'ex-paralela', nome: 'Paralela', tipoCarga: TIPOS_CARGA.ASSISTIDO },
  ],
  ['ex-leg', { id: 'ex-leg', nome: 'Leg press', tipoCarga: TIPOS_CARGA.CARGA }],
]);

const item = (itemId, exercicioId, ordem, extra = {}) => ({
  itemId,
  exercicioId,
  ordem,
  tipo: 'exercicio',
  opcional: false,
  ...extra,
});

const serie = (
  id,
  itemId,
  exercicioId,
  ordemItem,
  numero,
  carga,
  reps,
  aquecimento = false
) => ({
  id,
  sessaoId: 's1',
  itemId,
  exercicioId,
  ordemItem,
  numero,
  carga,
  reps,
  aquecimento,
  anotacao: '',
});

const sessao = {
  id: 's1',
  data: '2026-09-18',
  treinoNome: 'A',
  cor: '#4f8cff',
  status: STATUS.FINALIZADA,
  anotacao: 'Bom treino',
  itens: [
    item('i1', 'ex-supino', 0),
    item('i2', 'ex-barra', 1),
    item('i3', 'ex-leg', 2, { opcional: true }),
  ],
};

const series = [
  // Fora de ordem de propósito.
  serie('b2', 'i2', 'ex-barra', 1, 2, 5, 6),
  serie('a2', 'i1', 'ex-supino', 0, 2, 16, 9),
  serie('a1', 'i1', 'ex-supino', 0, 1, 16, 10),
  serie('aq', 'i1', 'ex-supino', 0, 1, 10, 12, true),
  serie('b1', 'i2', 'ex-barra', 1, 1, null, 8),
];

/* --- Texto de uma série --- */

test('série com carga: "16 kg × 10", com vírgula decimal', () => {
  assert.equal(textoDaSerie({ carga: 16, reps: 10 }), '16 kg × 10');
  assert.equal(textoDaSerie({ carga: 12.5, reps: 8 }), '12,5 kg × 8');
  assert.equal(
    textoDaSerie({ carga: 0, reps: 15 }),
    '0 kg × 15',
    'zero é valor, não branco'
  );
});

test('o que não foi anotado aparece como "—", nunca como zero', () => {
  assert.equal(textoDaSerie({ carga: null, reps: 10 }), '— kg × 10');
  assert.equal(textoDaSerie({ carga: 20, reps: null }), '20 kg × —');
  assert.equal(textoDaSerie({ carga: undefined, reps: '' }), '— kg × —');
});

test('peso corporal: sem lastro, com lastro', () => {
  assert.equal(
    textoDaSerie({ carga: null, reps: 8 }, TIPOS_CARGA.PESO_CORPORAL),
    'peso corporal × 8'
  );
  assert.equal(
    textoDaSerie({ carga: 0, reps: 8 }, TIPOS_CARGA.PESO_CORPORAL),
    'peso corporal × 8'
  );
  assert.equal(
    textoDaSerie({ carga: 5, reps: 6 }, TIPOS_CARGA.PESO_CORPORAL),
    'peso corporal +5 kg × 6'
  );
});

test('assistido mostra a assistência', () => {
  assert.equal(
    textoDaSerie({ carga: 20, reps: 6 }, TIPOS_CARGA.ASSISTIDO),
    'assistência 20 kg × 6'
  );
  assert.equal(
    textoDaSerie({ carga: null, reps: 6 }, TIPOS_CARGA.ASSISTIDO),
    'assistência — kg × 6'
  );
});

test('carga com dízima é arredondada em duas casas', () => {
  assert.equal(textoDaSerie({ carga: 0.1 + 0.2, reps: 1 }), '0,3 kg × 1');
  assert.equal(textoDaSerie({ carga: 22.675, reps: 1 }), '22,68 kg × 1');
});

/* --- Estrutura do resumo --- */

test('exercícios na ordem da sessão, séries ordenadas com aquecimento primeiro', () => {
  const r = resumirSessao({ sessao, series, exercicios });
  assert.deepEqual(
    r.exercicios.map((e) => e.nome),
    ['Supino reto máquina', 'Barra fixa', 'Leg press']
  );
  assert.deepEqual(
    r.exercicios[0].series.map((s) => s.rotulo),
    ['aq 1', '1', '2']
  );
  assert.deepEqual(
    r.exercicios[0].series.map((s) => s.texto),
    ['10 kg × 12', '16 kg × 10', '16 kg × 9']
  );
  assert.deepEqual(
    r.exercicios.map((e) => e.posicao),
    [1, 2, 3]
  );
});

test('a ordem segue o campo "ordem" do item, não a posição no array', () => {
  const reordenada = {
    ...sessao,
    itens: [sessao.itens[2], sessao.itens[0], { ...sessao.itens[1], ordem: 5 }],
  };
  const r = resumirSessao({ sessao: reordenada, series, exercicios });
  assert.deepEqual(
    r.exercicios.map((e) => e.nome),
    ['Supino reto máquina', 'Leg press', 'Barra fixa']
  );
});

test('exercício sem séries aparece como não feito', () => {
  const r = resumirSessao({ sessao, series, exercicios });
  assert.equal(r.exercicios[2].feito, false);
  assert.equal(r.exercicios[2].opcional, true);
});

test('totais: aquecimento fica fora das séries e das reps', () => {
  const r = resumirSessao({ sessao, series, exercicios });
  assert.deepEqual(r.totais, {
    exercicios: 2,
    series: 4,
    aquecimentos: 1,
    reps: 10 + 9 + 8 + 6,
  });
});

test('reps em branco não somam nem viram NaN', () => {
  const r = resumirSessao({
    sessao,
    series: [serie('x', 'i1', 'ex-supino', 0, 1, 10, null)],
    exercicios,
  });
  assert.equal(r.totais.reps, 0);
  assert.equal(r.totais.series, 1);
});

test('série órfã (item que não existe mais) não some do resumo', () => {
  const orfa = serie('o1', 'i-sumiu', 'ex-paralela', 9, 1, 20, 6);
  const r = resumirSessao({ sessao, series: [...series, orfa], exercicios });
  const ultimo = r.exercicios[r.exercicios.length - 1];
  assert.equal(ultimo.nome, 'Paralela');
  assert.deepEqual(
    ultimo.series.map((s) => s.texto),
    ['assistência 20 kg × 6']
  );
  assert.equal(r.totais.series, 5);
});

test('exercício apagado do cadastro usa o nome do grupo ou um aviso', () => {
  const s = {
    ...sessao,
    itens: [
      item('i1', 'ex-apagado', 0),
      item('i2', 'ex-sumiu', 1, { nome: 'Remada (alternativas)' }),
    ],
  };
  const r = resumirSessao({ sessao: s, series: [], exercicios });
  assert.deepEqual(
    r.exercicios.map((e) => e.nome),
    ['Exercício removido', 'Remada (alternativas)']
  );
});

test('sessão sem itens nem séries não quebra', () => {
  const r = resumirSessao({
    sessao: { id: 'v', data: '2026-01-01', treinoNome: 'B' },
    series: [],
    exercicios,
  });
  assert.deepEqual(r.exercicios, []);
  assert.deepEqual(r.totais, { exercicios: 0, series: 0, aquecimentos: 0, reps: 0 });
  assert.equal(r.anotacao, '');
  assert.equal(r.finalizada, false);
});

test('o resumo não altera os objetos recebidos', () => {
  const copiaSessao = JSON.parse(JSON.stringify(sessao));
  const copiaSeries = JSON.parse(JSON.stringify(series));
  resumirSessao({ sessao, series, exercicios });
  assert.deepEqual(sessao, copiaSessao);
  assert.deepEqual(series, copiaSeries);
});

test('editar uma série muda o resumo seguinte (ele reflete o que está salvo)', () => {
  const antes = textoParaCopiar(resumirSessao({ sessao, series, exercicios }));
  const editadas = series.map((s) => (s.id === 'a1' ? { ...s, carga: 18, reps: 8 } : s));
  const depois = textoParaCopiar(resumirSessao({ sessao, series: editadas, exercicios }));
  assert.match(antes, /- 16 kg × 10\n/);
  assert.match(depois, /- 18 kg × 8\n/);
  assert.doesNotMatch(depois, /- 16 kg × 10\n/);
});

/* --- Texto para copiar --- */

test('texto completo, linha a linha', () => {
  const texto = textoParaCopiar(resumirSessao({ sessao, series, exercicios }));
  assert.equal(
    texto,
    [
      'Treino A · 18/09/2026',
      '',
      '1. Supino reto máquina',
      '- aq: 10 kg × 12',
      '- 16 kg × 10',
      '- 16 kg × 9',
      '',
      '2. Barra fixa',
      '- peso corporal × 8',
      '- peso corporal +5 kg × 6',
      '',
      '3. Leg press (opcional, não feito)',
      '',
      'Anotação: Bom treino',
      '',
      '2 exercícios · 4 séries · 33 reps',
    ].join('\n')
  );
});

test('o texto é colável: sem tabulação, sem espaço no começo nem no fim das linhas, sem \\r', () => {
  const texto = textoParaCopiar(resumirSessao({ sessao, series, exercicios }));
  assert.doesNotMatch(texto, /\t|\r/);
  texto.split('\n').forEach((linha) => {
    assert.equal(linha, linha.trim(), `linha com espaço sobrando: "${linha}"`);
  });
  assert.ok(!texto.endsWith('\n'), 'sem linha vazia no fim');
});

test('sessão em andamento é marcada no título', () => {
  const r = resumirSessao({
    sessao: { ...sessao, status: STATUS.EM_ANDAMENTO },
    series,
    exercicios,
  });
  assert.equal(textoParaCopiar(r).split('\n')[0], 'Treino A · 18/09/2026 (em andamento)');
});

test('sem anotação, não sai a linha "Anotação"', () => {
  for (const anotacao of ['', '   ', undefined]) {
    const r = resumirSessao({ sessao: { ...sessao, anotacao }, series, exercicios });
    assert.doesNotMatch(textoParaCopiar(r), /Anotação/);
  }
});

test('anotação de várias linhas é preservada', () => {
  const r = resumirSessao({
    sessao: { ...sessao, anotacao: 'linha 1\nlinha 2' },
    series,
    exercicios,
  });
  assert.match(textoParaCopiar(r), /Anotação: linha 1\nlinha 2\n/);
});

test('anotação da série vai entre parênteses', () => {
  const comNota = series.map((s) =>
    s.id === 'a2' ? { ...s, anotacao: 'falhei na última' } : s
  );
  const texto = textoParaCopiar(resumirSessao({ sessao, series: comNota, exercicios }));
  assert.match(texto, /- 16 kg × 9 \(falhei na última\)/);
});

test('totais no singular e no plural', () => {
  assert.equal(
    textoDosTotais({ exercicios: 1, series: 1, reps: 1 }),
    '1 exercício · 1 série · 1 rep'
  );
  assert.equal(
    textoDosTotais({ exercicios: 0, series: 0, reps: 0 }),
    '0 exercícios · 0 séries · 0 reps'
  );
});
