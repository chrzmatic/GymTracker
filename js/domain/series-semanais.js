/**
 * Contador de séries por músculo (especificação, seção 6.6).
 *
 * Duas visões:
 *
 *  - **Planejado**: um ciclo completo da rotação (cada treino uma vez),
 *    usando as séries planejadas e a alternativa padrão de cada grupo.
 *    Hoje um ciclo é uma semana, mas isso pode mudar se a frequência
 *    mudar — por isso o rótulo na tela fala em "ciclo", não em "semana".
 *
 *  - **Realizado**: as séries registradas de fato num período, sem
 *    aquecimento.
 *
 * A conta em si é a mesma nos dois casos: cada série feita num exercício
 * rende 1 para cada músculo **direto** dele e a fração definida para cada
 * músculo **indireto**. Quatro séries de supino com tríceps indireto 0,5
 * valem 2 séries indiretas de tríceps.
 */

/**
 * Soma vazia para um músculo.
 * @returns {{diretas: number, indiretas: number, total: number}}
 */
function zero() {
  return { diretas: 0, indiretas: 0, total: 0 };
}

/**
 * Acrescenta N séries de um exercício ao acumulador por músculo.
 * @param {Map<string, Object>} acumulador
 * @param {Object|undefined} exercicio
 * @param {number} quantasSeries
 */
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
 * Transforma o acumulador numa lista ordenada, com o nome de cada músculo.
 *
 * Todos os músculos cadastrados aparecem, mesmo zerados: um músculo que
 * ficou em zero na semana é exatamente o que interessa ver.
 *
 * @param {Map<string, Object>} acumulador
 * @param {Object[]} musculos lista de músculos, na ordem do usuário
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
 * Séries planejadas num ciclo completo da rotação.
 *
 * @param {Object[]} treinos treinos da rotação, na ordem
 * @param {Map<string, Object>} exercicios
 * @param {Object[]} musculos
 * @param {{incluirOpcionais?: boolean}} [opcoes]
 * @returns {Object[]} uma linha por músculo
 */
export function planejadoPorMusculo(treinos, exercicios, musculos, opcoes = {}) {
  const incluirOpcionais = opcoes.incluirOpcionais !== false;
  const acumulador = new Map();

  treinos.forEach((treino) => {
    (treino.itens ?? []).forEach((item) => {
      if (item.opcional && !incluirOpcionais) return;
      // Num grupo de alternativas vale a alternativa padrão, que é a que
      // a próxima sessão vai começar usando.
      const exercicioId =
        item.tipo === 'alternativas' ? item.exercicioPadraoId : item.exercicioId;
      somarExercicio(acumulador, exercicios.get(exercicioId), item.seriesPlanejadas ?? 0);
    });
  });

  return comNomes(acumulador, musculos);
}

/**
 * Séries realmente registradas, a partir de uma lista de séries.
 *
 * Aquecimento fica de fora, como a especificação pede: ele não conta como
 * volume de trabalho para músculo nenhum.
 *
 * @param {Object[]} series séries registradas (podem incluir aquecimento)
 * @param {Map<string, Object>} exercicios
 * @param {Object[]} musculos
 * @returns {Object[]} uma linha por músculo
 */
export function realizadoPorMusculo(series, exercicios, musculos) {
  const acumulador = new Map();
  series
    .filter((s) => !s.aquecimento)
    .forEach((s) => somarExercicio(acumulador, exercicios.get(s.exercicioId), 1));
  return comNomes(acumulador, musculos);
}

/**
 * Junta planejado e realizado, com a diferença por músculo.
 * @param {Object[]} planejado
 * @param {Object[]} realizado
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

/**
 * Arredonda para no máximo duas casas, matando o lixo de ponto flutuante.
 *
 * Existe porque 0,5 + 0,5 + 0,25 em binário não dá exatamente 1,25, e a
 * tabela de séries semanais soma muitas frações.
 *
 * @param {number} valor
 * @returns {number}
 */
export function arredondar(valor) {
  return Math.round(valor * 100) / 100;
}

/**
 * Aplica o arredondamento a uma tabela inteira.
 * @param {Object[]} linhas
 * @returns {Object[]}
 */
export function arredondarTabela(linhas) {
  return linhas.map((l) => ({
    ...l,
    diretas: arredondar(l.diretas),
    indiretas: arredondar(l.indiretas),
    total: arredondar(l.total),
  }));
}
