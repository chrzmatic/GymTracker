/**
 * Datas do app.
 *
 * Toda data é local, no formato AAAA-MM-DD, sem converter para UTC.
 * Contas entre datas usam dias de calendário, então o horário de verão não interfere.
 */

const MS_POR_DIA = 86400000;

/** Dias da semana; 0 = domingo, como Date#getDay. */
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

/** Date para AAAA-MM-DD local. */
export function paraIso(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** Data de hoje (AAAA-MM-DD). */
export function hojeIso() {
  return paraIso(new Date());
}

/** Separa AAAA-MM-DD em ano, mês (1-12) e dia. */
export function partesIso(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return { ano, mes, dia };
}

/** AAAA-MM-DD para Date local à meia-noite. `new Date(iso)` leria como UTC. */
export function deIso(iso) {
  const { ano, mes, dia } = partesIso(iso);
  return new Date(ano, mes - 1, dia);
}

/** Instante UTC usado só para contar dias. */
function marcoUtc(iso) {
  const { ano, mes, dia } = partesIso(iso);
  return Date.UTC(ano, mes - 1, dia);
}

/** Dias de calendário de isoA até isoB (positivo se isoB for depois). */
export function diffEmDias(isoA, isoB) {
  return Math.round((marcoUtc(isoB) - marcoUtc(isoA)) / MS_POR_DIA);
}

/** Soma (ou subtrai) dias a uma data AAAA-MM-DD. */
export function somarDias(iso, dias) {
  const { ano, mes, dia } = partesIso(iso);
  return paraIso(new Date(ano, mes - 1, dia + dias));
}

/** Dia da semana (0 = domingo … 6 = sábado). */
export function diaDaSemana(iso) {
  return deIso(iso).getDay();
}

/**
 * Primeiro dia da semana da data.
 * @param {string} iso
 * @param {number} inicioSemana 0 = domingo, 1 = segunda…
 * @returns {string} AAAA-MM-DD
 */
export function inicioDaSemana(iso, inicioSemana = 1) {
  const recuo = (diaDaSemana(iso) - inicioSemana + 7) % 7;
  return somarDias(iso, -recuo);
}

/** true se as duas datas caem na mesma semana. */
export function mesmaSemana(isoA, isoB, inicioSemana = 1) {
  return inicioDaSemana(isoA, inicioSemana) === inicioDaSemana(isoB, inicioSemana);
}

/** true se isoB está numa semana posterior à de isoA. */
export function semanaPosterior(isoA, isoB, inicioSemana = 1) {
  return inicioDaSemana(isoB, inicioSemana) > inicioDaSemana(isoA, inicioSemana);
}

/** DD/MM. */
export function formatarCurto(iso) {
  const { mes, dia } = partesIso(iso);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`;
}

/** DD/MM/AAAA. */
export function formatarLongo(iso) {
  const { ano, mes, dia } = partesIso(iso);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
}

/** "hoje", "ontem", "há 3 dias" ou a data. */
export function descreverDistancia(iso, referencia = hojeIso()) {
  const dias = diffEmDias(iso, referencia);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias > 1 && dias < 30) return `há ${dias} dias`;
  if (dias === -1) return 'amanhã';
  if (dias < 0 && dias > -30) return `em ${-dias} dias`;
  return formatarLongo(iso);
}

/** Quantos dias tem o mês (mes de 1 a 12). */
export function diasNoMes(ano, mes) {
  return new Date(ano, mes, 0).getDate();
}

/** DD/MM/AAAA HH:MM local. */
export function formatarDataHora(valor) {
  const d = valor instanceof Date ? valor : new Date(valor);
  const hora = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${formatarLongo(paraIso(d))} ${hora}:${min}`;
}
