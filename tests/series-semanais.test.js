/**
 * Testes do contador de séries por músculo (especificação, seção 6.6).
 *
 * O teste central é o que a seção 8 pede na Etapa 5: reproduzir a tabela
 * de séries semanais do `TREINO-DADOS.md` **a partir do arquivo de carga
 * inicial de verdade**, não de dados inventados aqui. Se alguém mexer no
 * seed e desalinhar dos dados oficiais, este teste quebra.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  planejadoPorMusculo,
  realizadoPorMusculo,
  compararPlanejadoRealizado,
  arredondarTabela,
} from '../js/domain/series-semanais.js';

const seed = JSON.parse(
  await readFile(new URL('../js/data/seed-treino.json', import.meta.url), 'utf8')
);

const exercicios = new Map(seed.exercicios.map((e) => [e.id, e]));
const musculos = seed.musculos;
const rotacao = seed.treinos.filter((t) => t.naRotacao);

/** Tabela do TREINO-DADOS.md: [músculo, diretas, indiretas, total]. */
const ESPERADO_COM_OPCIONAIS = [
  ['Peito', 11, 0, 11],
  ['Costas', 12, 0, 12],
  ['Ombro lateral', 8, 0, 8],
  ['Ombro anterior', 0, 4, 4],
  ['Ombro posterior', 3, 2, 5],
  ['Bíceps', 6, 6, 12],
  ['Tríceps', 6, 4, 10],
  ['Quadríceps', 11, 0, 11],
  ['Posterior de coxa', 8, 1, 9],
  ['Glúteo', 0, 3.5, 3.5],
  ['Panturrilha', 2, 0, 2],
  ['Abdômen', 3, 0, 3],
  ['Lombar', 0, 2, 2],
];

/** Converte a tabela calculada para o formato comparável. */
const comoTabela = (linhas) =>
  arredondarTabela(linhas).map((l) => [l.nome, l.diretas, l.indiretas, l.total]);

/* ------------------------------------------------------------------ */
/* O teste que a especificação pede                                    */
/* ------------------------------------------------------------------ */

test('a rotação inicial reproduz a tabela de séries semanais do TREINO-DADOS.md', () => {
  const calculado = comoTabela(planejadoPorMusculo(rotacao, exercicios, musculos));

  // Compara linha a linha para a mensagem de erro dizer qual músculo errou.
  ESPERADO_COM_OPCIONAIS.forEach((esperada) => {
    const real = calculado.find((l) => l[0] === esperada[0]);
    assert.deepEqual(real, esperada, `músculo ${esperada[0]}`);
  });

  assert.equal(
    calculado.length,
    ESPERADO_COM_OPCIONAIS.length,
    'a tabela tem exatamente os músculos da especificação'
  );
});

test('sem os opcionais, só Panturrilha e Abdômen zeram', () => {
  const comOpcionais = comoTabela(planejadoPorMusculo(rotacao, exercicios, musculos));
  const semOpcionais = comoTabela(
    planejadoPorMusculo(rotacao, exercicios, musculos, { incluirOpcionais: false })
  );

  const mudaram = semOpcionais.filter((linha, i) => linha[3] !== comOpcionais[i][3]);
  assert.deepEqual(
    mudaram.map((l) => [l[0], l[3]]),
    [
      ['Panturrilha', 0],
      ['Abdômen', 0],
    ],
    'os opcionais do seed são só panturrilha (treino A) e abdominal (treino C)'
  );
});

test('o Glúteo com 3,5 não vira 3,4999 por causa do ponto flutuante', () => {
  const tabela = arredondarTabela(planejadoPorMusculo(rotacao, exercicios, musculos));
  const gluteo = tabela.find((l) => l.nome === 'Glúteo');
  assert.equal(gluteo.indiretas, 3.5);
  assert.equal(gluteo.total, 3.5);
});

/* ------------------------------------------------------------------ */
/* A conta em si, com dados pequenos                                   */
/* ------------------------------------------------------------------ */

const musculosTeste = [
  { id: 'mus-peito', nome: 'Peito' },
  { id: 'mus-triceps', nome: 'Tríceps' },
  { id: 'mus-costas', nome: 'Costas' },
];

const exerciciosTeste = new Map([
  [
    'ex-supino',
    {
      id: 'ex-supino',
      nome: 'Supino',
      musculos: [
        { musculoId: 'mus-peito', tipo: 'direto', fracao: 1 },
        { musculoId: 'mus-triceps', tipo: 'indireto', fracao: 0.5 },
      ],
    },
  ],
  [
    'ex-remada',
    {
      id: 'ex-remada',
      nome: 'Remada',
      musculos: [{ musculoId: 'mus-costas', tipo: 'direto', fracao: 1 }],
    },
  ],
  [
    'ex-face',
    { id: 'ex-face', nome: 'Face pull', musculos: [] },
  ],
]);

const acharPorNome = (tabela, nome) => tabela.find((l) => l.nome === nome);

test('quatro séries de supino dão 4 diretas de peito e 2 indiretas de tríceps', () => {
  const treino = {
    id: 'tr-a',
    naRotacao: true,
    itens: [{ id: 'i1', tipo: 'exercicio', exercicioId: 'ex-supino', seriesPlanejadas: 4 }],
  };
  const t = planejadoPorMusculo([treino], exerciciosTeste, musculosTeste);
  assert.deepEqual(acharPorNome(t, 'Peito'), {
    musculoId: 'mus-peito',
    nome: 'Peito',
    diretas: 4,
    indiretas: 0,
    total: 4,
  });
  assert.equal(acharPorNome(t, 'Tríceps').indiretas, 2, '4 × 0,5');
});

test('músculo sem nenhuma série aparece zerado, não some da tabela', () => {
  const t = planejadoPorMusculo([], exerciciosTeste, musculosTeste);
  assert.equal(t.length, 3);
  assert.equal(acharPorNome(t, 'Costas').total, 0);
});

test('um grupo de alternativas conta pela alternativa padrão', () => {
  const treino = {
    id: 'tr-b',
    naRotacao: true,
    itens: [
      {
        id: 'i1',
        tipo: 'alternativas',
        alternativas: ['ex-supino', 'ex-remada'],
        exercicioPadraoId: 'ex-remada',
        seriesPlanejadas: 3,
      },
    ],
  };
  const t = planejadoPorMusculo([treino], exerciciosTeste, musculosTeste);
  assert.equal(acharPorNome(t, 'Costas').diretas, 3, 'a padrão é a remada');
  assert.equal(acharPorNome(t, 'Peito').diretas, 0, 'a outra alternativa não conta');
});

test('exercício sem músculos definidos não quebra nem inventa contagem', () => {
  const treino = {
    id: 'tr-c',
    naRotacao: true,
    itens: [{ id: 'i1', tipo: 'exercicio', exercicioId: 'ex-face', seriesPlanejadas: 3 }],
  };
  const t = planejadoPorMusculo([treino], exerciciosTeste, musculosTeste);
  assert.deepEqual(t.map((l) => l.total), [0, 0, 0]);
});

test('exercício que não existe mais é ignorado', () => {
  const treino = {
    id: 'tr-d',
    naRotacao: true,
    itens: [{ id: 'i1', tipo: 'exercicio', exercicioId: 'ex-apagado', seriesPlanejadas: 3 }],
  };
  assert.doesNotThrow(() => planejadoPorMusculo([treino], exerciciosTeste, musculosTeste));
});

/* ------------------------------------------------------------------ */
/* Realizado                                                           */
/* ------------------------------------------------------------------ */

test('cada série registrada conta 1 para os diretos e a fração para os indiretos', () => {
  const series = [
    { exercicioId: 'ex-supino', aquecimento: false },
    { exercicioId: 'ex-supino', aquecimento: false },
    { exercicioId: 'ex-remada', aquecimento: false },
  ];
  const t = realizadoPorMusculo(series, exerciciosTeste, musculosTeste);
  assert.equal(acharPorNome(t, 'Peito').diretas, 2);
  assert.equal(acharPorNome(t, 'Tríceps').indiretas, 1, '2 × 0,5');
  assert.equal(acharPorNome(t, 'Costas').diretas, 1);
});

test('aquecimento não conta como série de nenhum músculo', () => {
  const series = [
    { exercicioId: 'ex-supino', aquecimento: true },
    { exercicioId: 'ex-supino', aquecimento: true },
    { exercicioId: 'ex-supino', aquecimento: false },
  ];
  const t = realizadoPorMusculo(series, exerciciosTeste, musculosTeste);
  assert.equal(acharPorNome(t, 'Peito').diretas, 1, 'só a série valendo');
});

test('semana sem treino nenhum dá tudo zero', () => {
  const t = realizadoPorMusculo([], exerciciosTeste, musculosTeste);
  assert.deepEqual(t.map((l) => l.total), [0, 0, 0]);
});

/* ------------------------------------------------------------------ */
/* Planejado × realizado                                               */
/* ------------------------------------------------------------------ */

test('a diferença mostra o que faltou e o que sobrou', () => {
  const treino = {
    id: 'tr-a',
    naRotacao: true,
    itens: [{ id: 'i1', tipo: 'exercicio', exercicioId: 'ex-supino', seriesPlanejadas: 4 }],
  };
  const planejado = planejadoPorMusculo([treino], exerciciosTeste, musculosTeste);
  const realizado = realizadoPorMusculo(
    [
      { exercicioId: 'ex-supino', aquecimento: false },
      { exercicioId: 'ex-supino', aquecimento: false },
      { exercicioId: 'ex-remada', aquecimento: false },
    ],
    exerciciosTeste,
    musculosTeste
  );

  const comparado = compararPlanejadoRealizado(planejado, realizado);
  const peito = acharPorNome(comparado, 'Peito');
  assert.equal(peito.planejado.total, 4);
  assert.equal(peito.realizado.total, 2);
  assert.equal(peito.diferenca, -2, 'faltaram 2 séries de peito');

  const costas = acharPorNome(comparado, 'Costas');
  assert.equal(costas.planejado.total, 0);
  assert.equal(costas.diferenca, 1, 'uma série de costas que não estava planejada');
});

test('a comparação cobre todos os músculos do planejado', () => {
  const planejado = planejadoPorMusculo([], exerciciosTeste, musculosTeste);
  const comparado = compararPlanejadoRealizado(planejado, []);
  assert.equal(comparado.length, 3);
  assert.deepEqual(comparado.map((c) => c.diferenca), [0, 0, 0]);
});
