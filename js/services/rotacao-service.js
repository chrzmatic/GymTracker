/**
 * Sugestão do próximo treino e dados do calendário.
 * Sempre recalculado, então registros retroativos e edições aparecem na hora.
 */

import { listarSessoes } from '../data/sessoes-repo.js';
import { listarTreinos } from '../data/treinos-repo.js';
import { lerTodasConfigs } from '../data/config-repo.js';
import { hojeIso, partesIso } from '../utils/date.js';
import { explicarSugestao, sugerirTreino } from '../domain/rotacao.js';
import { agruparPorData, montarMes, resumoDoMes } from '../domain/calendario.js';

/**
 * Treino sugerido para um dia (padrão: hoje).
 * @returns {Promise<{treino: Object, motivo: string, ultima: Object|null, diasDesde: number|null, explicacao: string}|null>}
 */
export async function sugestaoPara(dia = hojeIso()) {
  const [sessoes, treinos, config] = await Promise.all([
    listarSessoes(),
    listarTreinos(),
    lerTodasConfigs(),
  ]);
  const rotacao = treinos.filter((t) => t.naRotacao);
  const sugestao = sugerirTreino(sessoes, rotacao, dia, config);
  if (!sugestao) return null;
  return { ...sugestao, explicacao: explicarSugestao(sugestao) };
}

/**
 * Tudo que o calendário precisa de um mês, incluindo a sugestão
 * de cada dia sem sessão.
 * @param {number} ano
 * @param {number} mes 1-12
 */
export async function dadosDoMes(ano, mes) {
  const [sessoes, treinos, config] = await Promise.all([
    listarSessoes(),
    listarTreinos(),
    lerTodasConfigs(),
  ]);
  const rotacao = treinos.filter((t) => t.naRotacao);
  const grade = montarMes(ano, mes, config.inicioSemana);
  const porData = agruparPorData(sessoes);

  const doMes = sessoes.filter((s) => {
    const p = partesIso(s.data);
    return p.ano === ano && p.mes === mes;
  });

  return {
    grade,
    porData,
    config,
    rotacao,
    treinos,
    resumo: resumoDoMes(doMes),
    /** Sugestão de qualquer dia da grade, sem reler o banco. */
    sugestaoDoDia(dia) {
      const s = sugerirTreino(sessoes, rotacao, dia, config);
      return s ? { ...s, explicacao: explicarSugestao(s) } : null;
    },
  };
}

export { hojeIso };
