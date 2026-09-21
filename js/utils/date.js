/**
 * Utilitários de data.
 *
 * Regra central do app: uma data de sessão é sempre uma **data local** no
 * formato AAAA-MM-DD. Nunca convertemos para UTC, porque na Nova Zelândia
 * (UTC+12/+13) um treino da manhã viraria o dia anterior.
 *
 * Toda conta entre datas é feita em **dias de calendário**: convertemos as
 * partes ano/mês/dia para um instante UTC artificial e subtraímos. Assim o
 * horário de verão (que faz um dia ter 23 ou 25 horas) não interfere.
 */

const MS_POR_DIA = 86400000;

/** Nomes dos dias da semana, índice 0 = domingo (igual a Date#getDay). */
export const NOMES_DIA_SEMANA = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

export const NOMES_MES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/**
 * Converte um objeto Date para data local no formato AAAA-MM-DD.
 * Usa os getters locais (getFullYear/getMonth/getDate), nunca toISOString.
 * @param {Date} data
 * @returns {string} AAAA-MM-DD
 */
export function paraIso(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Data de hoje no fuso do aparelho.
 * @returns {string} AAAA-MM-DD
 */
export function hojeIso() {
  return paraIso(new Date());
}

/**
 * Quebra uma data AAAA-MM-DD em partes numéricas.
 * @param {string} iso
 * @returns {{ano: number, mes: number, dia: number}} mes é 1-12
 */
export function partesIso(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return { ano, mes, dia };
}

/**
 * Converte AAAA-MM-DD em um Date local à meia-noite.
 * Não usar `new Date(iso)`: essa forma interpreta a string como UTC.
 * @param {string} iso
 * @returns {Date}
 */
export function deIso(iso) {
  const { ano, mes, dia } = partesIso(iso);
  return new Date(ano, mes - 1, dia);
}

/**
 * Instante UTC artificial usado só para contas de dias de calendário.
 * @param {string} iso
 * @returns {number}
 */
function marcoUtc(iso) {
  const { ano, mes, dia } = partesIso(iso);
  return Date.UTC(ano, mes - 1, dia);
}

/**
 * Diferença em dias de calendário entre duas datas (b - a).
 * Imune a horário de verão.
 * @param {string} isoA
 * @param {string} isoB
 * @returns {number} positivo se isoB for posterior
 */
export function diffEmDias(isoA, isoB) {
  return Math.round((marcoUtc(isoB) - marcoUtc(isoA)) / MS_POR_DIA);
}

/**
 * Soma (ou subtrai) dias de calendário a uma data.
 * @param {string} iso
 * @param {number} dias
 * @returns {string} AAAA-MM-DD
 */
export function somarDias(iso, dias) {
  const { ano, mes, dia } = partesIso(iso);
  return paraIso(new Date(ano, mes - 1, dia + dias));
}

/**
 * Dia da semana de uma data (0 = domingo … 6 = sábado).
 * @param {string} iso
 * @returns {number}
 */
export function diaDaSemana(iso) {
  return deIso(iso).getDay();
}

/**
 * Primeiro dia da semana que contém a data, conforme o dia de início escolhido.
 * @param {string} iso
 * @param {number} inicioSemana 0 = domingo, 1 = segunda … (padrão 1)
 * @returns {string} AAAA-MM-DD do primeiro dia da semana
 */
export function inicioDaSemana(iso, inicioSemana = 1) {
  const recuo = (diaDaSemana(iso) - inicioSemana + 7) % 7;
  return somarDias(iso, -recuo);
}

/**
 * Diz se duas datas caem na mesma semana.
 * @param {string} isoA
 * @param {string} isoB
 * @param {number} inicioSemana
 * @returns {boolean}
 */
export function mesmaSemana(isoA, isoB, inicioSemana = 1) {
  return inicioDaSemana(isoA, inicioSemana) === inicioDaSemana(isoB, inicioSemana);
}

/**
 * Diz se isoB está numa semana posterior à de isoA.
 * @param {string} isoA
 * @param {string} isoB
 * @param {number} inicioSemana
 * @returns {boolean}
 */
export function semanaPosterior(isoA, isoB, inicioSemana = 1) {
  return inicioDaSemana(isoB, inicioSemana) > inicioDaSemana(isoA, inicioSemana);
}

/**
 * Formata uma data para exibição curta: DD/MM.
 * @param {string} iso
 * @returns {string}
 */
export function formatarCurto(iso) {
  const { mes, dia } = partesIso(iso);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}

/**
 * Formata uma data para exibição completa: DD/MM/AAAA.
 * @param {string} iso
 * @returns {string}
 */
export function formatarLongo(iso) {
  const { ano, mes, dia } = partesIso(iso);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
}

/**
 * Texto amigável: "hoje", "ontem", "há 3 dias" ou a data curta.
 * @param {string} iso
 * @param {string} [referencia] data base (padrão: hoje)
 * @returns {string}
 */
export function descreverDistancia(iso, referencia = hojeIso()) {
  const dias = diffEmDias(iso, referencia);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias > 1 && dias < 30) return `há ${dias} dias`;
  if (dias === -1) return 'amanhã';
  if (dias < 0 && dias > -30) return `em ${-dias} dias`;
  return formatarLongo(iso);
}

/**
 * Quantidade de dias de um mês.
 * @param {number} ano
 * @param {number} mes 1-12
 * @returns {number}
 */
export function diasNoMes(ano, mes) {
  return new Date(ano, mes, 0).getDate();
}

/**
 * Carimbo de data e hora local legível, usado em backups e status.
 * @param {number|Date} valor timestamp ou Date
 * @returns {string} DD/MM/AAAA HH:MM
 */
export function formatarDataHora(valor) {
  const d = valor instanceof Date ? valor : new Date(valor);
  const hora = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${formatarLongo(paraIso(d))} ${hora}:${min}`;
}
