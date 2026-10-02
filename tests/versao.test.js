/**
 * Testes da versão do app (scripts/versao-lib.js) e da coerência entre o
 * arquivo gerado, o service worker e a tela de configurações.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  montarVersao,
  conteudoDoArquivo,
  atualizarServiceWorker,
} from '../scripts/versao-lib.js';
import { VERSAO, BUILD, DATA_DA_VERSAO } from '../js/versao.js';

const ler = (caminho) => readFileSync(new URL('../' + caminho, import.meta.url), 'utf8');

test('MAJOR.MINOR vêm do package.json e o terceiro número é o commit', () => {
  assert.equal(montarVersao('1.0.0', 10), '1.0.10');
  assert.equal(
    montarVersao('1.2.7', 154),
    '1.2.154',
    'o patch do package.json é ignorado'
  );
  assert.equal(montarVersao('2.0.0', 0), '2.0.0');
});

test('package.json sem versão vira 0.0.N em vez de quebrar', () => {
  assert.equal(montarVersao(undefined, 3), '0.0.3');
  assert.equal(montarVersao('', 3), '0.0.3');
  assert.equal(montarVersao('x.y', 3), '0.0.3');
});

test('build inválido é recusado', () => {
  assert.throws(() => montarVersao('1.0.0', -1));
  assert.throws(() => montarVersao('1.0.0', 1.5));
  assert.throws(() => montarVersao('1.0.0', NaN));
});

test('o arquivo gerado é um módulo com versão, build e data', async () => {
  const codigo = conteudoDoArquivo({ versao: '1.0.42', build: 42, data: '2026-10-02' });
  const modulo = await import('data:text/javascript,' + encodeURIComponent(codigo));
  assert.equal(modulo.VERSAO, '1.0.42');
  assert.equal(modulo.BUILD, 42);
  assert.equal(modulo.DATA_DA_VERSAO, '2026-10-02');
});

test('atualizar o service worker troca só a linha da VERSAO', () => {
  const antes = "a();\nconst VERSAO = 'v15';\nconst CACHE = `gymtracker-${VERSAO}`;\n";
  const depois = atualizarServiceWorker(antes, '1.0.10');
  assert.equal(
    depois,
    "a();\nconst VERSAO = '1.0.10';\nconst CACHE = `gymtracker-${VERSAO}`;\n"
  );
  assert.equal(
    atualizarServiceWorker(depois, '1.0.10'),
    depois,
    'rodar de novo não muda nada'
  );
});

test('service worker sem a linha da VERSAO dá erro em vez de passar calado', () => {
  assert.throws(() => atualizarServiceWorker('const CACHE = 1;', '1.0.1'), /VERSAO/);
});

test('js/versao.js atual é coerente com o package.json', () => {
  const pacote = JSON.parse(ler('package.json'));
  assert.equal(VERSAO, montarVersao(pacote.version, BUILD));
  assert.match(DATA_DA_VERSAO, /^\d{4}-\d{2}-\d{2}$/);
});

test('o cache do service worker usa a mesma versão mostrada no app', () => {
  assert.match(
    ler('service-worker.js'),
    new RegExp(`const VERSAO = '${VERSAO.replace(/\./g, '\\.')}';`)
  );
});
