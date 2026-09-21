/**
 * Casos de uso da sugestão do próximo treino e do calendário.
 *
 * Junta três fontes — sessões registradas, treinos da rotação e as
 * configurações — e entrega para as telas o resultado já pronto.
 *
 * Tudo depende de datas, então qualquer registro retroativo, edição ou
 * exclusão de sessão muda o resultado na próxima leitura. Não há nada em
 * cache: a especificação pede que a sugestão, o calendário e o resto se
 * atualizem sozinhos quando o histórico muda, e a forma mais simples de
 * garantir isso é sempre recalcular.
 */

import { listarSessoes } from '../data/sessoes-repo.js';
import { listarTreinos } from '../data/treinos-repo.js';
import { lerTodasConfigs } from '../data/config-repo.js';
import { hojeIso, partesIso } from '../utils/date.js';
import { sugerirTreino, explicarSugestao } from '../domain/rotacao.js';
import { montarMes, agruparPorData, resumoDoMes } from '../domain/calendario.js';

/**
 * Sugere o treino de um dia.
 * @param {string} [dia] AAAA-MM-DD (padrão: hoje)
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
 * Tudo que a tela do calendário precisa de um mês.
 *
 * Inclui a sugestão de cada dia **sem** sessão, calculada com as sessões
 * anteriores àquele dia — é isso que faz um dia futuro mostrar o treino
 * que seria sugerido para ele.
 *
 * @param {number} ano
 * @param {number} mes 1-12
 * @returns {Promise<Object>}
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
    /**
     * Sugestão de um dia qualquer da grade, sem reler o banco.
     * @param {string} dia
     * @returns {Object|null}
     */
    sugestaoDoDia(dia) {
      const s = sugerirTreino(sessoes, rotacao, dia, config);
      return s ? { ...s, explicacao: explicarSugestao(s) } : null;
    },
  };
}

export { hojeIso };
