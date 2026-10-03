/**
 * Coerência entre os arquivos do projeto e o que o app carrega:
 * lista offline do service worker e telas registradas na navegação.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const raiz = new URL('../', import.meta.url);
const ler = (caminho) => readFileSync(new URL(caminho, raiz), 'utf8');

/** Todos os .js e .json de js/, com caminho relativo à raiz. */
function arquivosDoApp(pasta = 'js/') {
  return readdirSync(new URL(pasta, raiz), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? arquivosDoApp(`${pasta}${e.name}/`)
      : /\.(js|json)$/.test(e.name)
        ? [`${pasta}${e.name}`]
        : []
  );
}

const listaDoServiceWorker = [...ler('service-worker.js').matchAll(/'\.\/([^']*)'/g)].map(
  (m) => m[1]
);

test('todo arquivo de js/ está na lista offline do service worker', () => {
  const faltando = arquivosDoApp().filter((a) => !listaDoServiceWorker.includes(a));
  assert.deepEqual(faltando, []);
});

test('todo arquivo da lista do service worker existe', () => {
  const inexistentes = listaDoServiceWorker.filter(
    (a) => a && !existsSync(new URL(a, raiz))
  );
  assert.deepEqual(inexistentes, []);
});

test('toda tela registrada na navegação aponta para uma função exportada que existe', () => {
  const codigo = ler('js/navegacao.js');
  const telas = [
    ...codigo.matchAll(/import\('\.\/(views\/[^']+)'\)\.then\(\(m\) => m\.(\w+)\)/g),
  ].map((m) => ({ arquivo: 'js/' + m[1], funcao: m[2] }));
  assert.ok(telas.length > 10, 'achou as telas');
  telas.forEach(({ arquivo, funcao }) => {
    assert.ok(existsSync(new URL(arquivo, raiz)), `${arquivo} existe`);
    assert.match(
      ler(arquivo),
      new RegExp(`export async function ${funcao}\\b`),
      `${arquivo} exporta ${funcao}`
    );
  });
});

test('a tela de resumo da sessão está registrada', () => {
  assert.match(ler('js/navegacao.js'), /'sessao-resumo':/);
});
