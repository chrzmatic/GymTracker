/**
 * Cálculos de nutrição (especificação, seção 6.7).
 *
 * Funções puras. A regra central é uma regra de três:
 *
 *     valor do item = quantidade ÷ quantidade de referência × valor de referência
 *
 * Os planos **nunca** guardam kcal nem macros: guardam alimento e
 * quantidade. Tudo é calculado na hora, a partir do índice. É isso que faz
 * corrigir um valor no índice atualizar o dia inteiro sozinho.
 *
 * Três situações em que o app se recusa a inventar número:
 *
 *  - **Unidades incompatíveis** (200 ml de um alimento medido em gramas):
 *    devolve erro no item em vez de calcular errado.
 *  - **Valor em branco** no índice: conta como 0 na soma, mas o item e a
 *    refeição ficam marcados como "dados incompletos".
 *  - **Alimento apagado** do índice: erro no item, não zero silencioso.
 */

/** Os cinco valores que o app soma. */
export const NUTRIENTES = ['kcal', 'proteina', 'gordura', 'carbo', 'fibra'];

/** Unidades aceitas. Só comparam entre iguais. */
export const UNIDADES = { G: 'g', ML: 'ml', UNIDADE: 'unidade' };

/** Tipos de item de refeição. */
export const TIPO_ITEM = {
  ALIMENTO: 'alimento',
  PRATO: 'prato',
  GRUPO: 'grupo',
  LIVRE: 'livre',
};

/**
 * Objeto de valores zerado.
 * @returns {Object}
 */
export function zeros() {
  return Object.fromEntries(NUTRIENTES.map((n) => [n, 0]));
}

/**
 * Soma dois conjuntos de valores.
 * @param {Object} a
 * @param {Object} b
 * @returns {Object}
 */
export function somar(a, b) {
  return Object.fromEntries(NUTRIENTES.map((n) => [n, (a[n] ?? 0) + (b[n] ?? 0)]));
}

/**
 * Multiplica um conjunto de valores por um fator.
 * @param {Object} valores
 * @param {number} fator
 * @returns {Object}
 */
export function escalar(valores, fator) {
  return Object.fromEntries(NUTRIENTES.map((n) => [n, (valores[n] ?? 0) * fator]));
}

/**
 * Arredonda os valores para exibição, matando o lixo de ponto flutuante.
 * @param {Object} valores
 * @param {number} [casas]
 * @returns {Object}
 */
export function arredondar(valores, casas = 1) {
  const f = 10 ** casas;
  return Object.fromEntries(
    NUTRIENTES.map((n) => [n, Math.round((valores[n] ?? 0) * f) / f])
  );
}

/**
 * Valores de referência de um alimento, com os brancos virando zero.
 *
 * A especificação manda contar branco como 0 e marcar o item — em vez de
 * abortar a soma do dia inteiro por causa de uma fibra não preenchida.
 *
 * @param {Object} alimento
 * @returns {{valores: Object, incompleto: boolean, faltando: string[]}}
 */
export function valoresDeReferencia(alimento) {
  const faltando = NUTRIENTES.filter(
    (n) => alimento[n] === null || alimento[n] === undefined || alimento[n] === ''
  );
  const valores = Object.fromEntries(
    NUTRIENTES.map((n) => [n, Number(alimento[n]) || 0])
  );
  return { valores, incompleto: faltando.length > 0, faltando };
}

/**
 * Calcula um alimento numa quantidade qualquer (a regra de três).
 *
 * @param {Object|undefined} alimento
 * @param {number|null} quantidade
 * @param {string} [unidade] unidade da quantidade; vazia assume a do alimento
 * @returns {{valores: Object, erro: string|null, incompleto: boolean, faltando: string[]}}
 */
export function calcularAlimento(alimento, quantidade, unidade) {
  if (!alimento) {
    return { valores: zeros(), erro: 'Alimento não está mais no índice.', incompleto: true, faltando: [] };
  }

  const daQuantidade = unidade ?? alimento.unidade;
  if (daQuantidade !== alimento.unidade) {
    return {
      valores: zeros(),
      erro: `Unidades incompatíveis: o item está em ${daQuantidade} e ${alimento.nome} é medido em ${alimento.unidade}.`,
      incompleto: true,
      faltando: [],
    };
  }

  const referencia = Number(alimento.quantidadeRef);
  if (!referencia) {
    return {
      valores: zeros(),
      erro: `${alimento.nome} está sem quantidade de referência.`,
      incompleto: true,
      faltando: [],
    };
  }

  if (quantidade === null || quantidade === undefined || Number.isNaN(Number(quantidade))) {
    return { valores: zeros(), erro: null, incompleto: true, faltando: ['quantidade'] };
  }

  const { valores, incompleto, faltando } = valoresDeReferencia(alimento);
  return {
    valores: escalar(valores, Number(quantidade) / referencia),
    erro: null,
    incompleto,
    faltando,
  };
}

/**
 * Calcula um prato composto inteiro (uma porção).
 *
 * @param {Object|undefined} prato
 * @param {Map<string, Object>} alimentos
 * @returns {{valores: Object, erro: string|null, incompleto: boolean, ingredientes: Object[]}}
 */
export function calcularPrato(prato, alimentos) {
  if (!prato) {
    return { valores: zeros(), erro: 'Prato não existe mais.', incompleto: true, ingredientes: [] };
  }

  let total = zeros();
  let incompleto = false;
  let erro = null;

  const ingredientes = (prato.ingredientes ?? []).map((ing) => {
    const alimento = alimentos.get(ing.alimentoId);
    const r = calcularAlimento(alimento, ing.quantidade, ing.unidade);
    total = somar(total, r.valores);
    if (r.incompleto) incompleto = true;
    if (r.erro && !erro) erro = r.erro;
    return {
      alimentoId: ing.alimentoId,
      nome: alimento ? alimento.nome : 'Alimento removido',
      quantidade: ing.quantidade,
      unidade: alimento ? alimento.unidade : (ing.unidade ?? ''),
      ...r,
    };
  });

  if (!ingredientes.length) {
    incompleto = true;
  }

  return { valores: total, erro, incompleto, ingredientes };
}

/**
 * Calcula uma opção de grupo ou um item simples.
 * @param {Object} opcao
 * @param {{alimentos: Map, pratos: Map}} indice
 * @returns {{nome: string, valores: Object, erro: string|null, incompleto: boolean}}
 */
export function calcularOpcao(opcao, indice) {
  if (opcao.tipo === TIPO_ITEM.PRATO) {
    const prato = indice.pratos.get(opcao.pratoId);
    const r = calcularPrato(prato, indice.alimentos);
    const porcoes = opcao.porcoes ?? opcao.quantidade ?? 1;
    return {
      nome: prato ? prato.nome : 'Prato removido',
      descricao: `${porcoes} ${porcoes === 1 ? 'porção' : 'porções'}`,
      valores: escalar(r.valores, porcoes),
      erro: r.erro,
      incompleto: r.incompleto,
    };
  }

  const alimento = indice.alimentos.get(opcao.alimentoId);
  const r = calcularAlimento(alimento, opcao.quantidade, opcao.unidade);
  const unidade = alimento ? alimento.unidade : (opcao.unidade ?? '');
  return {
    nome: alimento ? alimento.nome : 'Alimento removido',
    descricao: `${opcao.quantidade ?? '—'} ${unidade}`,
    valores: r.valores,
    erro: r.erro,
    incompleto: r.incompleto,
  };
}

/**
 * Calcula um item de refeição.
 *
 * Num **grupo de opções**, o total usa a alternativa marcada como padrão —
 * é o que você planeja comer. A faixa mínima e máxima do grupo vai junto,
 * para a refeição saber o quanto ela pode variar.
 *
 * Um **item livre** ("salada à vontade") não entra em conta nenhuma.
 *
 * @param {Object} item
 * @param {{alimentos: Map, pratos: Map}} indice
 * @returns {Object}
 */
export function calcularItem(item, indice) {
  if (item.tipo === TIPO_ITEM.LIVRE) {
    return {
      itemId: item.id,
      tipo: item.tipo,
      nome: item.texto ?? 'Item livre',
      valores: zeros(),
      minimo: zeros(),
      maximo: zeros(),
      erro: null,
      incompleto: false,
      livre: true,
    };
  }

  if (item.tipo === TIPO_ITEM.GRUPO) {
    const opcoes = (item.opcoes ?? []).map((o) => ({
      ...calcularOpcao(o, indice),
      opcaoId: o.id,
      padrao: o.id === item.padraoId,
    }));

    const escolhida = opcoes.find((o) => o.padrao) ?? opcoes[0];
    const kcals = opcoes.map((o) => o.valores.kcal);

    return {
      itemId: item.id,
      tipo: item.tipo,
      nome: item.nome ?? 'Grupo',
      opcoes,
      escolhida: escolhida ?? null,
      valores: escolhida ? escolhida.valores : zeros(),
      minimo: opcoes.length ? extremo(opcoes, Math.min) : zeros(),
      maximo: opcoes.length ? extremo(opcoes, Math.max) : zeros(),
      erro: escolhida ? escolhida.erro : 'Grupo sem opções.',
      incompleto: opcoes.some((o) => o.incompleto) || !opcoes.length,
      variaKcal: kcals.length > 1 ? Math.max(...kcals) - Math.min(...kcals) : 0,
    };
  }

  const r = calcularOpcao(item, indice);
  return {
    itemId: item.id,
    tipo: item.tipo,
    nome: r.nome,
    descricao: r.descricao,
    valores: r.valores,
    minimo: r.valores,
    maximo: r.valores,
    erro: r.erro,
    incompleto: r.incompleto,
  };
}

/**
 * Menor ou maior valor de cada nutriente entre as opções.
 *
 * Por nutriente, não pela opção inteira: a opção com menos kcal nem sempre
 * é a com menos proteína, e a faixa tem que ser honesta em cada linha.
 *
 * @param {Object[]} opcoes
 * @param {(...n: number[]) => number} escolher Math.min ou Math.max
 * @returns {Object}
 */
function extremo(opcoes, escolher) {
  return Object.fromEntries(
    NUTRIENTES.map((n) => [n, escolher(...opcoes.map((o) => o.valores[n] ?? 0))])
  );
}

/**
 * Calcula uma refeição inteira.
 * @param {Object} refeicao
 * @param {{alimentos: Map, pratos: Map}} indice
 * @returns {Object}
 */
export function calcularRefeicao(refeicao, indice) {
  const itens = (refeicao.itens ?? []).map((i) => calcularItem(i, indice));

  let total = zeros();
  let minimo = zeros();
  let maximo = zeros();
  let incompleto = false;
  const erros = [];

  itens.forEach((i) => {
    total = somar(total, i.valores);
    minimo = somar(minimo, i.minimo);
    maximo = somar(maximo, i.maximo);
    if (i.incompleto) incompleto = true;
    if (i.erro) erros.push({ nome: i.nome, erro: i.erro });
  });

  return {
    refeicaoId: refeicao.id,
    nome: refeicao.nome,
    ordem: refeicao.ordem ?? 0,
    itens,
    total,
    minimo,
    maximo,
    /** true quando as opções fazem a refeição variar. */
    varia: maximo.kcal - minimo.kcal > 0.0001,
    incompleto,
    erros,
  };
}

/**
 * Calcula um plano de dia inteiro e compara com as metas.
 *
 * @param {Object} plano
 * @param {Object[]} refeicoes as refeições do plano, já resolvidas
 * @param {{alimentos: Map, pratos: Map}} indice
 * @returns {Object}
 */
export function calcularPlano(plano, refeicoes, indice) {
  const calculadas = refeicoes
    .slice()
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .map((r) => calcularRefeicao(r, indice));

  let total = zeros();
  let minimo = zeros();
  let maximo = zeros();
  let incompleto = false;
  const erros = [];

  calculadas.forEach((r) => {
    total = somar(total, r.total);
    minimo = somar(minimo, r.minimo);
    maximo = somar(maximo, r.maximo);
    if (r.incompleto) incompleto = true;
    r.erros.forEach((e) => erros.push({ ...e, refeicao: r.nome }));
  });

  return {
    planoId: plano.id,
    nome: plano.nome,
    metas: metasDoPlano(plano),
    refeicoes: calculadas,
    total,
    minimo,
    maximo,
    varia: maximo.kcal - minimo.kcal > 0.0001,
    incompleto,
    erros,
    diferencas: compararComMetas(total, metasDoPlano(plano)),
  };
}

/**
 * Metas do plano, normalizadas. Meta ausente vira null, não zero.
 * @param {Object} plano
 * @returns {Object}
 */
export function metasDoPlano(plano) {
  const metas = plano.metas ?? {};
  const pegar = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  return {
    kcal: pegar(plano.metaKcal ?? metas.kcal),
    proteina: pegar(metas.proteina),
    gordura: pegar(metas.gordura),
    carbo: pegar(metas.carbo),
    fibra: pegar(metas.fibra),
  };
}

/**
 * Diferença entre o total do dia e cada meta.
 * @param {Object} total
 * @param {Object} metas
 * @returns {Object} por nutriente: {meta, total, diferenca, percentual} ou null
 */
export function compararComMetas(total, metas) {
  return Object.fromEntries(
    NUTRIENTES.map((n) => {
      const meta = metas[n];
      if (meta === null || meta === undefined) return [n, null];
      const valor = total[n] ?? 0;
      return [
        n,
        {
          meta,
          total: valor,
          diferenca: valor - meta,
          percentual: meta === 0 ? null : (valor / meta) * 100,
        },
      ];
    })
  );
}
