/**
 * Montagem da grade do calendário mensal.
 *
 * Função pura: recebe ano, mês e o dia de início da semana, devolve as
 * semanas já prontas para desenhar. A grade é sempre retangular — os dias
 * que sobram nas pontas vêm dos meses vizinhos, marcados com
 * `doMes: false`, porque uma grade com buracos fica confusa de ler.
 */

import { partesIso, somarDias, diasNoMes, NOMES_DIA_SEMANA } from '../utils/date.js';

/**
 * Monta as semanas de um mês.
 * @param {number} ano
 * @param {number} mes 1-12
 * @param {number} [inicioSemana] 0 = domingo, 1 = segunda…
 * @returns {{semanas: {iso: string, dia: number, doMes: boolean}[][], primeiro: string, ultimo: string}}
 */
export function montarMes(ano, mes, inicioSemana = 1) {
  const primeiro = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const total = diasNoMes(ano, mes);
  const ultimo = `${ano}-${String(mes).padStart(2, '0')}-${String(total).padStart(2, '0')}`;

  // Quantos dias do mês anterior entram na primeira linha.
  const diaDaSemanaDoPrimeiro = new Date(ano, mes - 1, 1).getDay();
  const recuo = (diaDaSemanaDoPrimeiro - inicioSemana + 7) % 7;

  const celulas = [];
  for (let i = 0; i < recuo; i += 1) {
    celulas.push(celula(somarDias(primeiro, i - recuo), false));
  }
  for (let d = 0; d < total; d += 1) {
    celulas.push(celula(somarDias(primeiro, d), true));
  }
  // Completa a última linha com o começo do mês seguinte.
  while (celulas.length % 7 !== 0) {
    celulas.push(celula(somarDias(ultimo, celulas.length - recuo - total + 1), false));
  }

  const semanas = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));

  return { semanas, primeiro, ultimo };
}

/** Uma célula da grade. */
function celula(iso, doMes) {
  return { iso, dia: partesIso(iso).dia, doMes };
}

/**
 * Rótulos dos dias da semana na ordem certa, para o cabeçalho da grade.
 * @param {number} [inicioSemana]
 * @returns {string[]} ex.: ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']
 */
export function rotulosDaSemana(inicioSemana = 1) {
  return Array.from({ length: 7 }, (_, i) => {
    const nome = NOMES_DIA_SEMANA[(inicioSemana + i) % 7];
    return nome.slice(0, 3);
  });
}

/**
 * Agrupa as sessões por data.
 * Mais de uma sessão no mesmo dia é permitido, então cada data guarda uma
 * lista — o calendário mostra uma bolinha por sessão.
 * @param {Object[]} sessoes
 * @returns {Map<string, Object[]>}
 */
export function agruparPorData(sessoes) {
  const mapa = new Map();
  sessoes.forEach((s) => {
    if (!mapa.has(s.data)) mapa.set(s.data, []);
    mapa.get(s.data).push(s);
  });
  mapa.forEach((lista) => lista.sort((a, b) => (a.criadaEm ?? 0) - (b.criadaEm ?? 0)));
  return mapa;
}

/**
 * O que oferecer ao tocar num dia do calendário.
 *
 * A regra que faltava: um dia que já tem treino também precisa oferecer
 * "registrar outro", porque mais de uma sessão no mesmo dia é permitida.
 * Antes dava para criar só nos dias vazios, o que tornava impossível
 * acrescentar um segundo treino a um dia já registrado.
 *
 * Dia futuro não registra nada — só informa o que seria sugerido.
 *
 * @param {string} dia AAAA-MM-DD
 * @param {Object[]} sessoesDoDia
 * @param {string} hoje AAAA-MM-DD
 * @returns {{abrir: string[], podeRegistrar: boolean, futuro: boolean}}
 */
export function acoesDoDia(dia, sessoesDoDia, hoje) {
  const futuro = dia > hoje;
  return {
    abrir: sessoesDoDia.map((s) => s.id),
    podeRegistrar: !futuro,
    futuro,
  };
}

/**
 * Passa para o mês anterior ou seguinte.
 * @param {number} ano
 * @param {number} mes 1-12
 * @param {-1|1} direcao
 * @returns {{ano: number, mes: number}}
 */
export function mesVizinho(ano, mes, direcao) {
  const total = mes - 1 + direcao;
  return { ano: ano + Math.floor(total / 12), mes: ((total % 12) + 12) % 12 + 1 };
}

/**
 * Resumo do mês para a linha abaixo da grade.
 * @param {Object[]} sessoes sessões do mês
 * @returns {{total: number, porTreino: {nome: string, cor: string|null, quantas: number}[]}}
 */
export function resumoDoMes(sessoes) {
  const porTreino = new Map();
  sessoes.forEach((s) => {
    const chave = s.treinoId ?? s.treinoNome;
    if (!porTreino.has(chave)) {
      porTreino.set(chave, { nome: s.treinoNome, cor: s.cor ?? null, quantas: 0 });
    }
    porTreino.get(chave).quantas += 1;
  });
  return {
    total: sessoes.length,
    porTreino: [...porTreino.values()].sort((a, b) => b.quantas - a.quantas),
  };
}
