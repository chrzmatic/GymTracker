/**
 * Formatação de números e textos para exibição.
 * Tudo em português, com vírgula decimal.
 */

/**
 * Formata um número com no máximo `casas` decimais, sem zeros à toa.
 * @param {number|null|undefined} valor
 * @param {number} [casas=1]
 * @returns {string} '' quando o valor não é um número
 */
export function num(valor, casas = 1) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '';
  const arredondado = Math.round(valor * 10 ** casas) / 10 ** casas;
  return String(arredondado).replace('.', ',');
}

/**
 * Formata uma carga em kg.
 * @param {number|null} valor
 * @returns {string} ex.: '62,5 kg'
 */
export function kg(valor) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return `${num(valor, 2)} kg`;
}

/**
 * Formata uma diferença com sinal explícito.
 * @param {number} valor
 * @param {number} [casas=1]
 * @returns {string} ex.: '+2,5' / '-1' / '0'
 */
export function comSinal(valor, casas = 1) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  const texto = num(Math.abs(valor), casas);
  if (valor > 0) return `+${texto}`;
  if (valor < 0) return `-${texto}`;
  return '0';
}

/**
 * Formata uma variação percentual.
 * @param {number|null} valor percentual já calculado (ex.: 12.5)
 * @returns {string} ex.: '+12,5%'
 */
export function percentual(valor) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return `${comSinal(valor, 1)}%`;
}

/**
 * Classe CSS de cor conforme a direção de uma diferença.
 * Verde melhora, vermelho piora, cinza igual.
 * @param {number} diferenca
 * @param {boolean} [maiorEhMelhor=true] falso para assistência, onde menos é melhor
 * @returns {'melhora'|'piora'|'igual'}
 */
export function direcao(diferenca, maiorEhMelhor = true) {
  if (!diferenca) return 'igual';
  const positivo = diferenca > 0;
  return positivo === maiorEhMelhor ? 'melhora' : 'piora';
}

/**
 * Converte texto de campo numérico (aceita vírgula) em número ou null.
 * @param {string} texto
 * @returns {number|null}
 */
export function paraNumero(texto) {
  if (texto === null || texto === undefined) return null;
  const limpo = String(texto).trim().replace(',', '.');
  if (limpo === '') return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pluraliza uma palavra simples conforme a quantidade.
 * @param {number} n
 * @param {string} singular
 * @param {string} plural
 * @returns {string}
 */
export function plural(n, singular, plural) {
  return `${num(n, 1)} ${n === 1 ? singular : plural}`;
}
