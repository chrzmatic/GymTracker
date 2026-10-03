/**
 * Séries por músculo.
 *
 * - Planejado: um ciclo da rotação, com a alternativa padrão de cada grupo.
 * - Realizado: as séries registradas no período, sem aquecimento.
 *
 * Cada série conta 1 para músculo direto e a fração para indireto
 * (4 séries de supino com tríceps 0,5 = 2 séries de tríceps).
 */

function zero() {
  return { diretas: 0, indiretas: 0, total: 0 };
}

/** Soma N séries de um exercício aos músculos dele. */
function somarExercicio(acumulador, exercicio, quantasSeries) {
  if (!exercicio || !quantasSeries) return;
  (exercicio.musculos ?? []).forEach((m) => {
    if (!acumulador.has(m.musculoId)) acumulador.set(m.musculoId, zero());
    const alvo = acumulador.get(m.musculoId);
    if (m.tipo === 'direto') {
      alvo.diretas += quantasSeries;
    } else {
      alvo.indiretas += quantasSeries * (m.fracao ?? 0);
    }
    alvo.total = alvo.diretas + alvo.indiretas;
  });
}

/**
 * Lista ordenada com nomes. Músculos zerados também aparecem.
 * @returns {{musculoId: string, nome: string, diretas: number, indiretas: number, total: number}[]}
 */
function comNomes(acumulador, musculos) {
  return musculos.map((m) => ({
    musculoId: m.id,
    nome: m.nome,
    ...(acumulador.get(m.id) ?? zero()),
  }));
}

/**
 * Séries planejadas num ciclo da rotação, uma linha por músculo.
 * @param {Object[]} treinos da rotação, na ordem
 * @param {Map<string, Object>} exercicios
 * @param {Object[]} musculos
 * @param {{incluirOpcionais?: boolean}} [opcoes]
 */
export function planejadoPorMusculo(treinos, exercicios, musculos, opcoes = {}) {
  const incluirOpcionais = opcoes.incluirOpcionais !== false;
  const acumulador = new Map();

  treinos.forEach((treino) => {
    (treino.itens ?? []).forEach((item) => {
      if (item.opcional && !incluirOpcionais) return;
      // Num grupo, vale a alternativa padrão.
      const exercicioId = item.tipo === 'alternativas'
        ? item.exercicioPadraoId
        : item.exercicioId;
      somarExercicio(acumulador, exercicios.get(exercicioId), item.seriesPlanejadas ?? 0);
    });
  });

  return comNomes(acumulador, musculos);
}

/** Séries registradas, sem aquecimento, uma linha por músculo. */
export function realizadoPorMusculo(series, exercicios, musculos) {
  const acumulador = new Map();
  series
    .filter((s) => !s.aquecimento)
    .forEach((s) => somarExercicio(acumulador, exercicios.get(s.exercicioId), 1));
  return comNomes(acumulador, musculos);
}

/**
 * Planejado e realizado lado a lado, com a diferença.
 * @returns {{musculoId: string, nome: string, planejado: Object, realizado: Object, diferenca: number}[]}
 */
export function compararPlanejadoRealizado(planejado, realizado) {
  const porId = new Map(realizado.map((r) => [r.musculoId, r]));
  return planejado.map((p) => {
    const r = porId.get(p.musculoId) ?? zero();
    return {
      musculoId: p.musculoId,
      nome: p.nome,
      planejado: { diretas: p.diretas, indiretas: p.indiretas, total: p.total },
      realizado: { diretas: r.diretas, indiretas: r.indiretas, total: r.total },
      diferenca: r.total - p.total,
    };
  });
}

/** Duas casas, para somas de frações não virarem 1,2499999. */
export function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

/** Arredonda a tabela inteira. */
export function arredondarTabela(linhas) {
  return linhas.map((l) => ({
    ...l,
    diretas: arredondar(l.diretas),
    indiretas: arredondar(l.indiretas),
    total: arredondar(l.total),
  }));
}
