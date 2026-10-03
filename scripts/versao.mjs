/**
 * Gera js/versao.js e atualiza a versão no service worker.
 *
 *   node scripts/versao.mjs             versão do último commit
 *   node scripts/versao.mjs --proximo   versão do commit sendo feito (usado no hook)
 *
 * Também roda com Deno: `deno run -A scripts/versao.mjs --proximo`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { montarVersao, conteudoDoArquivo, atualizarServiceWorker } from './versao-lib.js';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const proximo = process.argv.includes('--proximo');

let commits = 0;
try {
  commits = Number(
    execFileSync('git', ['rev-list', '--count', 'HEAD'], {
      cwd: raiz,
      encoding: 'utf8',
    }).trim()
  );
} catch {
  commits = 0; // repositório sem nenhum commit ainda
}

const build = commits + (proximo ? 1 : 0);
const pacote = JSON.parse(readFileSync(raiz + 'package.json', 'utf8'));
const versao = montarVersao(pacote.version, build);
const hoje = new Date();
const data = [
  hoje.getFullYear(),
  String(hoje.getMonth() + 1).padStart(2, '0'),
  String(hoje.getDate()).padStart(2, '0'),
].join('-');

writeFileSync(raiz + 'js/versao.js', conteudoDoArquivo({ versao, build, data }));

const sw = raiz + 'service-worker.js';
writeFileSync(sw, atualizarServiceWorker(readFileSync(sw, 'utf8'), versao));

console.log(`versão ${versao}`);
