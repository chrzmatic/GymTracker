/**
 * Regras da versão do app (puras, para testar).
 * Formato MAJOR.MINOR.BUILD: MAJOR.MINOR do deno.json, BUILD = número do commit.
 */

/**
 * Versão a partir do `version` do deno.json e do número do commit.
 * @param {string} versaoDoPacote ex.: '1.0.0'
 * @param {number} build
 * @returns {string} ex.: '1.0.10'
 */
export function montarVersao(versaoDoPacote, build) {
  const [major, minor] = String(versaoDoPacote ?? '')
    .split('.')
    .map((n) => Number.parseInt(n, 10));
  if (!Number.isInteger(build) || build < 0) throw new Error(`Build inválido: ${build}`);
  return `${Number.isInteger(major) ? major : 0}.${Number.isInteger(minor) ? minor : 0}.${build}`;
}

/** Conteúdo do js/versao.js. */
export function conteudoDoArquivo({ versao, build, data }) {
  return [
    '/**',
    ' * Versão do app. Gerado por scripts/versao.mjs a cada commit (hook em',
    ' * .githooks/pre-commit); não editar à mão.',
    ' */',
    `export const VERSAO = '${versao}';`,
    `export const BUILD = ${build};`,
    `export const DATA_DA_VERSAO = '${data}';`,
    '',
  ].join('\n');
}

/** Troca a versão do cache no service worker (é o que dispara a atualização no app). */
export function atualizarServiceWorker(codigo, versao) {
  const padrao = /const VERSAO = '[^']*';/;
  if (!padrao.test(codigo))
    throw new Error('Não achei a linha da VERSAO no service worker.');
  return codigo.replace(padrao, `const VERSAO = '${versao}';`);
}
