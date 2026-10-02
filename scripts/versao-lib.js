/**
 * Regras da versão do app, sem acesso a disco nem a git (para testar).
 *
 * Formato: MAJOR.MINOR.BUILD, no estilo de versionamento semântico.
 * MAJOR.MINOR vêm do `package.json` e mudam à mão, quando fizer sentido;
 * BUILD é o número do commit (quantos commits a branch tem), então sobe
 * sozinho a cada commit e nunca se repete.
 */

/**
 * Monta a versão a partir do package.json e da contagem de commits.
 * @param {string} versaoDoPacote ex.: '1.0.0'
 * @param {number} build número do commit
 * @returns {string} ex.: '1.0.10'
 */
export function montarVersao(versaoDoPacote, build) {
  const [major, minor] = String(versaoDoPacote ?? '')
    .split('.')
    .map((n) => Number.parseInt(n, 10));
  if (!Number.isInteger(build) || build < 0) throw new Error(`Build inválido: ${build}`);
  return `${Number.isInteger(major) ? major : 0}.${Number.isInteger(minor) ? minor : 0}.${build}`;
}

/**
 * Conteúdo do js/versao.js.
 * @param {{versao: string, build: number, data: string}} info
 * @returns {string}
 */
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

/**
 * Troca a versão do cache no service worker. Mudar este texto é o que faz
 * o navegador baixar a versão nova e o app mostrar "Nova versão disponível".
 * @param {string} codigo conteúdo do service-worker.js
 * @param {string} versao
 * @returns {string}
 */
export function atualizarServiceWorker(codigo, versao) {
  const padrao = /const VERSAO = '[^']*';/;
  if (!padrao.test(codigo))
    throw new Error('Não achei a linha da VERSAO no service worker.');
  return codigo.replace(padrao, `const VERSAO = '${versao}';`);
}
