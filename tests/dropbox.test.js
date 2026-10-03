/** Testes das regras do backup no Dropbox: o que apagar e quando enviar. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  caminhoDoDiario,
  dataDoDiario,
  devoEnviar,
  diariosParaApagar,
  ordenarParaRestaurar,
  passouDoIntervalo,
} from '../js/sync/rotacao-backups.js';

/** Entrada como o `files/list_folder` do Dropbox devolve. */
function diario(data, modificadoEm = data + 'T12:00:00Z') {
  return {
    nome: 'backup-' + data + '.json',
    caminho: '/diario/backup-' + data + '.json',
    modificadoEm,
  };
}

test('o caminho da cópia diária usa a data no nome', () => {
  assert.equal(caminhoDoDiario('2026-09-22'), '/diario/backup-2026-09-22.json');
  assert.equal(dataDoDiario('backup-2026-09-22.json'), '2026-09-22');
  assert.equal(dataDoDiario('backup-atual.json'), null);
  assert.equal(dataDoDiario('qualquer-coisa.txt'), null);
});

test('com 7 cópias ou menos, nada é apagado', () => {
  const sete = [
    diario('2026-09-16'),
    diario('2026-09-17'),
    diario('2026-09-18'),
    diario('2026-09-19'),
    diario('2026-09-20'),
    diario('2026-09-21'),
    diario('2026-09-22'),
  ];
  assert.deepEqual(diariosParaApagar(sete), []);
  assert.deepEqual(diariosParaApagar(sete.slice(0, 3)), []);
  assert.deepEqual(diariosParaApagar([]), []);
});

test('com 10 cópias, as 3 mais antigas saem e as 7 mais novas ficam', () => {
  const dez = [];
  for (let d = 13; d <= 22; d++) {
    dez.push(diario('2026-09-' + String(d).padStart(2, '0')));
  }

  const apagar = diariosParaApagar(dez).map((e) => dataDoDiario(e.nome));
  assert.deepEqual(apagar.sort(), ['2026-09-13', '2026-09-14', '2026-09-15']);
});

test('a escolha do que apagar usa a data do nome, não a do arquivo', () => {
  // Caso real: depois de restaurar e enviar, o arquivo de hoje fica com horário
  // mais antigo que o de 16/09. Pela data de modificação, apagaria o de hoje.
  const entradas = [
    diario('2026-09-22', '2026-09-22T08:00:00Z'),
    diario('2026-09-21', '2026-09-22T09:00:00Z'),
    diario('2026-09-20', '2026-09-22T09:00:00Z'),
    diario('2026-09-19', '2026-09-22T09:00:00Z'),
    diario('2026-09-18', '2026-09-22T09:00:00Z'),
    diario('2026-09-17', '2026-09-22T09:00:00Z'),
    diario('2026-09-16', '2026-09-22T09:00:00Z'),
    diario('2026-09-15', '2026-09-22T09:00:00Z'),
  ];

  const apagar = diariosParaApagar(entradas);
  assert.equal(apagar.length, 1);
  assert.equal(dataDoDiario(apagar[0].nome), '2026-09-15');
});

test('arquivos fora do padrão do nome nunca são apagados', () => {
  const entradas = [
    { nome: 'anotacoes.txt', caminho: '/diario/anotacoes.txt' },
    { nome: 'backup-atual.json', caminho: '/diario/backup-atual.json' },
  ];
  for (let d = 10; d <= 22; d++) {
    entradas.push(diario('2026-09-' + String(d).padStart(2, '0')));
  }

  const apagar = diariosParaApagar(entradas).map((e) => e.nome);
  assert.ok(!apagar.includes('anotacoes.txt'));
  assert.ok(!apagar.includes('backup-atual.json'));
  assert.equal(apagar.length, 6);
});

test('nunca ter feito backup conta como passado do intervalo', () => {
  assert.equal(passouDoIntervalo(null), true);
  assert.equal(passouDoIntervalo('data inválida'), true);
});

test('o backup diário só refaz depois de 24 horas', () => {
  const agora = Date.parse('2026-09-22T10:00:00Z');
  const umDia = 24 * 60 * 60 * 1000;

  assert.equal(passouDoIntervalo('2026-09-22T09:00:00Z', agora, umDia), false);
  assert.equal(passouDoIntervalo('2026-09-21T11:00:00Z', agora, umDia), false);
  assert.equal(passouDoIntervalo('2026-09-21T10:00:00Z', agora, umDia), true);
  assert.equal(passouDoIntervalo('2026-09-20T10:00:00Z', agora, umDia), true);
});

test('backup manual e de fim de treino ignoram a espera mínima', () => {
  const agora = Date.parse('2026-09-22T10:00:00Z');
  const espera = 5 * 60 * 1000;
  const recemFeito = '2026-09-22T09:59:00Z';

  const situacao = { ultimoEm: recemFeito };
  assert.equal(devoEnviar({ ...situacao, motivo: 'manual' }, agora, espera), true);
  assert.equal(devoEnviar({ ...situacao, motivo: 'sessao' }, agora, espera), true);
  assert.equal(devoEnviar({ ...situacao, motivo: 'alteracao' }, agora, espera), false);
});

test('uma alteração espera 5 minutos desde o último backup', () => {
  const agora = Date.parse('2026-09-22T10:00:00Z');
  const espera = 5 * 60 * 1000;

  const recente = { motivo: 'alteracao', ultimoEm: '2026-09-22T09:58:00Z' };
  assert.equal(devoEnviar(recente, agora, espera), false);

  const velho = { motivo: 'alteracao', ultimoEm: '2026-09-22T09:54:00Z' };
  assert.equal(devoEnviar(velho, agora, espera), true);
});

test('o primeiro backup não espera nada', () => {
  const agora = Date.parse('2026-09-22T10:00:00Z');
  assert.equal(
    devoEnviar({ motivo: 'alteracao', ultimoEm: null }, agora, 5 * 60 * 1000),
    true,
  );
});

test('uma reforma inteira do treino vira um backup só, não vinte', () => {
  // Muitas alterações seguidas: com a espera, o banco sobe uma vez só.
  const espera = 5 * 60 * 1000;
  const inicio = Date.parse('2026-09-22T10:00:00Z');
  let ultimoEm = '2026-09-22T10:00:00Z';
  let enviados = 0;

  for (let i = 1; i <= 20; i++) {
    const agora = inicio + i * 10 * 1000; // uma alteração a cada 10 s
    if (devoEnviar({ motivo: 'alteracao', ultimoEm }, agora, espera)) {
      enviados += 1;
      ultimoEm = new Date(agora).toISOString();
    }
  }

  // 20 alterações em pouco mais de 3 minutos: nenhuma fura a espera de 5.
  assert.equal(enviados, 0);
});

test('a lista de restauração põe o mais recente em cima, depois os dias', () => {
  const entradas = [
    diario('2026-09-20'),
    { nome: 'backup-atual.json', caminho: '/backup-atual.json', modificadoEm: 'x' },
    diario('2026-09-22'),
    diario('2026-09-21'),
  ];

  const lista = ordenarParaRestaurar(entradas);
  assert.equal(lista[0].atual, true);
  assert.equal(lista[0].rotulo, 'Backup mais recente');
  assert.deepEqual(
    lista.slice(1).map((e) => e.rotulo),
    ['2026-09-22', '2026-09-21', '2026-09-20'],
  );
});
