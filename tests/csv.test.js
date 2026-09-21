/**
 * Testes da geração de CSV.
 *
 * O risco aqui é silencioso: um CSV mal escapado abre na planilha com as
 * colunas deslocadas e ninguém percebe até precisar dos dados.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  celula,
  numero,
  montarCsv,
  csvDeTreinos,
  csvDePeso,
  nomeDeArquivo,
  SEPARADOR,
  BOM,
} from '../js/domain/csv.js';

/* ---- escape ---- */

test('texto simples não ganha aspas', () => {
  assert.equal(celula('Supino'), 'Supino');
  assert.equal(celula(42), '42');
});

test('vazio e nulo viram célula vazia', () => {
  assert.equal(celula(null), '');
  assert.equal(celula(undefined), '');
  assert.equal(celula(''), '');
});

test('texto com o separador é envolvido em aspas', () => {
  assert.equal(celula('Supino; inclinado'), '"Supino; inclinado"');
});

test('aspas internas são dobradas', () => {
  assert.equal(celula('Rosca "martelo"'), '"Rosca ""martelo"""');
});

test('quebra de linha dentro da célula é preservada entre aspas', () => {
  assert.equal(celula('linha 1\nlinha 2'), '"linha 1\nlinha 2"');
});

/* ---- números ---- */

test('número sai com vírgula decimal, para o Excel em português', () => {
  assert.equal(numero(62.5), '62,5');
  assert.equal(numero(60), '60');
});

test('número ausente vira célula vazia, não zero', () => {
  assert.equal(numero(null), '');
  assert.equal(numero(undefined), '');
  assert.equal(numero(NaN), '');
  assert.equal(numero(0), '0', 'zero de verdade continua zero');
});

/* ---- montagem ---- */

test('o arquivo começa com BOM e usa ponto e vírgula', () => {
  const csv = montarCsv(['A', 'B'], [[1, 2]]);
  assert.ok(csv.startsWith(BOM), 'sem BOM o Excel no Windows erra os acentos');
  assert.ok(csv.includes(`A${SEPARADOR}B`));
});

test('as linhas terminam em CRLF e o arquivo também', () => {
  const csv = montarCsv(['A'], [[1], [2]]);
  assert.equal(csv, `${BOM}A\r\n1\r\n2\r\n`);
});

test('csv sem linhas ainda traz o cabeçalho', () => {
  assert.equal(montarCsv(['A', 'B'], []), `${BOM}A;B\r\n`);
});

/* ---- CSV de treinos ---- */

const sessoes = [
  {
    id: 's1',
    data: '2025-09-01',
    treinoNome: 'A',
    status: 'finalizada',
    criadaEm: 1,
    anotacao: 'ombro doendo',
  },
  { id: 's2', data: '2025-09-08', treinoNome: 'B', status: 'finalizada', criadaEm: 2, anotacao: '' },
];

const exercicios = new Map([
  ['ex-supino', { id: 'ex-supino', nome: 'Supino reto', tipoCarga: 'carga' }],
  ['ex-barra', { id: 'ex-barra', nome: 'Barra fixa', tipoCarga: 'peso-corporal' }],
]);

const series = [
  { sessaoId: 's2', exercicioId: 'ex-supino', ordemItem: 0, numero: 1, carga: 62.5, reps: 10, aquecimento: false, anotacao: '' },
  { sessaoId: 's1', exercicioId: 'ex-supino', ordemItem: 0, numero: 1, carga: 60, reps: 10, aquecimento: false, anotacao: 'fácil' },
  { sessaoId: 's1', exercicioId: 'ex-supino', ordemItem: 0, numero: 1, carga: 20, reps: 15, aquecimento: true, anotacao: '' },
  { sessaoId: 's1', exercicioId: 'ex-barra', ordemItem: 1, numero: 1, carga: null, reps: 8, aquecimento: false, anotacao: '' },
];

/** Quebra o CSV em linhas de células. */
function linhasDe(csv) {
  return csv
    .replace(BOM, '')
    .trimEnd()
    .split('\r\n')
    .map((l) => l.split(SEPARADOR));
}

test('uma linha por série, com o cabeçalho na frente', () => {
  const linhas = linhasDe(csvDeTreinos(sessoes, series, exercicios));
  assert.equal(linhas.length, 1 + series.length);
  assert.equal(linhas[0][0], 'Data');
  assert.equal(linhas[0][4], 'Exercício');
});

test('as séries saem em ordem de data, posição no treino e número', () => {
  const linhas = linhasDe(csvDeTreinos(sessoes, series, exercicios)).slice(1);
  assert.deepEqual(
    linhas.map((l) => [l[0], l[4], l[6]]),
    [
      ['2025-09-01', 'Supino reto', 'aquecimento'],
      ['2025-09-01', 'Supino reto', 'valendo'],
      ['2025-09-01', 'Barra fixa', 'valendo'],
      ['2025-09-08', 'Supino reto', 'valendo'],
    ],
    'aquecimento antes das séries valendo, como na tela'
  );
});

test('aquecimento vai marcado numa coluna própria, não é descartado', () => {
  const linhas = linhasDe(csvDeTreinos(sessoes, series, exercicios)).slice(1);
  const categorias = linhas.map((l) => l[6]);
  assert.ok(categorias.includes('aquecimento'));
  assert.ok(categorias.includes('valendo'));
});

test('a posição do exercício no treino vira coluna, começando em 1', () => {
  const linhas = linhasDe(csvDeTreinos(sessoes, series, exercicios)).slice(1);
  const barra = linhas.find((l) => l[4] === 'Barra fixa');
  assert.equal(barra[3], '2', 'ordemItem 1 vira posição 2');
});

test('carga vazia fica vazia, e a decimal usa vírgula', () => {
  const linhas = linhasDe(csvDeTreinos(sessoes, series, exercicios)).slice(1);
  const barra = linhas.find((l) => l[4] === 'Barra fixa');
  assert.equal(barra[8], '', 'barra fixa sem anilha não tem carga registrada');
  const inclinado = linhas.find((l) => l[0] === '2025-09-08');
  assert.equal(inclinado[8], '62,5');
});

test('as anotações da série e da sessão vão em colunas separadas', () => {
  const linhas = linhasDe(csvDeTreinos(sessoes, series, exercicios)).slice(1);
  const comNota = linhas.find((l) => l[10] === 'fácil');
  assert.ok(comNota, 'a anotação da série está lá');
  assert.equal(comNota[11], 'ombro doendo', 'e a da sessão também');
});

test('série de uma sessão apagada não quebra a exportação', () => {
  const orfa = [{ sessaoId: 'sumiu', exercicioId: 'ex-supino', numero: 1, carga: 50, reps: 5 }];
  assert.doesNotThrow(() => csvDeTreinos(sessoes, orfa, exercicios));
});

test('exercício apagado sai com o ID, para não perder o dado', () => {
  const orfa = [{ sessaoId: 's1', exercicioId: 'ex-sumiu', ordemItem: 0, numero: 1, carga: 50, reps: 5 }];
  const linhas = linhasDe(csvDeTreinos(sessoes, orfa, exercicios)).slice(1);
  assert.equal(linhas[0][4], 'ex-sumiu');
});

/* ---- CSV de peso ---- */

test('o peso sai em ordem cronológica', () => {
  const csv = csvDePeso([
    { data: '2025-09-10', kg: 79.5 },
    { data: '2025-08-01', kg: 82 },
  ]);
  const linhas = linhasDe(csv);
  assert.deepEqual(linhas, [
    ['Data', 'Peso (kg)'],
    ['2025-08-01', '82'],
    ['2025-09-10', '79,5'],
  ]);
});

/* ---- nome do arquivo ---- */

test('o nome do arquivo leva a data', () => {
  assert.equal(nomeDeArquivo('gymtracker-treinos', '2025-09-21', 'csv'), 'gymtracker-treinos-2025-09-21.csv');
});
