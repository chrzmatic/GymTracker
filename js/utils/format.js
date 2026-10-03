/** Formatação de números para a tela, com vírgula decimal. */

/** Número com até `casas` decimais, sem zeros à toa. Devolve '' se não for número. */
export function num(valor, casas = 1) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '';
  const arredondado = Math.round(valor * 10 ** casas) / 10 ** casas;
  return String(arredondado).replace('.', ',');
}

/** Carga em kg (ex.: '62,5 kg'). */
export function kg(valor) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return `${num(valor, 2)} kg`;
}

/** Diferença com sinal (ex.: '+2,5', '-1', '0'). */
export function comSinal(valor, casas = 1) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  const texto = num(Math.abs(valor), casas);
  if (valor > 0) return `+${texto}`;
  if (valor < 0) return `-${texto}`;
  return '0';
}

/** Percentual com sinal (ex.: '+12,5%'). */
export function percentual(valor) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return `${comSinal(valor, 1)}%`;
}

/**
 * Classe de cor de uma diferença: verde melhora, vermelho piora, cinza igual.
 * @param {number} diferenca
 * @param {boolean} [maiorEhMelhor=true] falso no assistido, onde menos é melhor
 * @returns {'melhora'|'piora'|'igual'}
 */
export function direcao(diferenca, maiorEhMelhor = true) {
  if (!diferenca) return 'igual';
  const positivo = diferenca > 0;
  return positivo === maiorEhMelhor ? 'melhora' : 'piora';
}

/** Texto de campo numérico (aceita vírgula) para número, ou null. */
export function paraNumero(texto) {
  if (texto === null || texto === undefined) return null;
  const limpo = String(texto).trim().replace(',', '.');
  if (limpo === '') return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** "1 série" / "3 séries". */
export function plural(n, singular, plural) {
  return `${num(n, 1)} ${n === 1 ? singular : plural}`;
}
