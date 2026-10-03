/**
 * Grade do calendário mensal. Sempre retangular: as pontas vêm dos meses
 * vizinhos, com `doMes: false`.
 */

import { partesIso, somarDias, diasNoMes, NOMES_DIA_SEMANA } from '../utils/date.js';

/**
 * Semanas de um mês.
 * @param {number} ano
 * @param {number} mes 1-12
 * @param {number} [inicioSemana] 0 = domingo, 1 = segunda…
 * @returns {{semanas: {iso: string, dia: number, doMes: boolean}[][], primeiro: string, ultimo: string}}
 */
export function montarMes(ano, mes, inicioSemana = 1) {
  const primeiro = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const total = diasNoMes(ano, mes);
  const ultimo = `${ano}-${String(mes).padStart(2, '0')}-${String(total).padStart(2, '0')}`;

  // Dias do mês anterior na primeira linha.
  const diaDaSemanaDoPrimeiro = new Date(ano, mes - 1, 1).getDay();
  const recuo = (diaDaSemanaDoPrimeiro - inicioSemana + 7) % 7;

  const celulas = [];
  for (let i = 0; i < recuo; i += 1) {
    celulas.push(celula(somarDias(primeiro, i - recuo), false));
  }
  for (let d = 0; d < total; d += 1) {
    celulas.push(celula(somarDias(primeiro, d), true));
  }
  // Completa a última linha com o mês seguinte.
  while (celulas.length % 7 !== 0) {
    celulas.push(celula(somarDias(ultimo, celulas.length - recuo - total + 1), false));
  }

  const semanas = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));

  return { semanas, primeiro, ultimo };
}

function celula(iso, doMes) {
  return { iso, dia: partesIso(iso).dia, doMes };
}

/** Iniciais dos dias da semana na ordem da grade (ex.: ['S', 'T', …]). */
export function rotulosDaSemana(inicioSemana = 1) {
  return Array.from({ length: 7 }, (_, i) => {
    const nome = NOMES_DIA_SEMANA[(inicioSemana + i) % 7];
    return nome.slice(0, 3);
  });
}

/**
 * Sessões por data. Um dia pode ter mais de uma.
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
 * O que oferecer ao tocar num dia.
 * Dia com treino também pode registrar outro. Dia futuro não registra.
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

/** Mês anterior (-1) ou seguinte (1). */
export function mesVizinho(ano, mes, direcao) {
  const total = mes - 1 + direcao;
  return { ano: ano + Math.floor(total / 12), mes: ((total % 12) + 12) % 12 + 1 };
}

/**
 * Total de treinos do mês e quantos de cada treino.
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
