/**
 * Cálculos da dieta.
 *
 * Regra de três: valor = quantidade ÷ quantidade de referência × valor de referência.
 * Os planos guardam só alimento e quantidade; os valores são sempre calculados.
 *
 * O app não inventa número:
 * - unidades diferentes (ml num alimento em g) dão erro no item;
 * - valor em branco conta 0 e marca o item como incompleto;
 * - alimento apagado dá erro no item.
 */

/** Os valores somados. */
export const NUTRIENTES = ['kcal', 'proteina', 'gordura', 'carbo', 'fibra'];

/** Rótulo, unidade e casas decimais de cada nutriente, na ordem de exibição. */
export const INFO_NUTRIENTES = [
  { id: 'kcal', rotulo: 'Calorias', unidade: 'kcal', casas: 0 },
  { id: 'proteina', rotulo: 'Proteína', unidade: 'g', casas: 1 },
  { id: 'gordura', rotulo: 'Gordura', unidade: 'g', casas: 1 },
  { id: 'carbo', rotulo: 'Carboidrato', unidade: 'g', casas: 1 },
  { id: 'fibra', rotulo: 'Fibra', unidade: 'g', casas: 1 },
];

/**
 * Os que, em branco, marcam o item como incompleto.
 * A fibra fica de fora: muitos rótulos não trazem e muitos alimentos não têm.
 */
export const NUTRIENTES_OBRIGATORIOS = ['kcal', 'proteina', 'gordura', 'carbo'];

/** Unidades de quantidade. Só se comparam entre iguais. */
export const UNIDADES = { G: 'g', ML: 'ml', UNIDADE: 'unidade' };

/** Unidades de energia na entrada. O app guarda e mostra só kcal. */
export const UNIDADES_ENERGIA = { KCAL: 'kcal', KJ: 'kj' };

/** 1 kcal = 4,184 kJ. */
export const KJ_POR_KCAL = 4.184;

/** kJ para kcal inteiro, ou null se não for número. */
export function kjParaKcal(kj) {
  if (kj === null || kj === undefined || kj === '') return null;
  const n = Number(kj);
  if (!Number.isFinite(n)) return null;
  return Math.round(n / KJ_POR_KCAL);
}

/**
 * Energia digitada, em kcal, ou null.
 * @param {number|string|null|undefined} valor
 * @param {string} [unidade] 'kcal' (padrão) ou 'kj'
 */
export function energiaEmKcal(valor, unidade = UNIDADES_ENERGIA.KCAL) {
  if (unidade === UNIDADES_ENERGIA.KJ) return kjParaKcal(valor);
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Tipos de item de refeição. */
export const TIPO_ITEM = {
  ALIMENTO: 'alimento',
  PRATO: 'prato',
  GRUPO: 'grupo',
  LIVRE: 'livre',
};

/** Valores todos zerados. */
export function zeros() {
  return Object.fromEntries(NUTRIENTES.map((n) => [n, 0]));
}

/** Soma dois conjuntos de valores. */
export function somar(a, b) {
  return Object.fromEntries(NUTRIENTES.map((n) => [n, (a[n] ?? 0) + (b[n] ?? 0)]));
}

/** Multiplica os valores por um fator. */
export function escalar(valores, fator) {
  return Object.fromEntries(NUTRIENTES.map((n) => [n, (valores[n] ?? 0) * fator]));
}

/** Arredonda os valores para exibir. */
export function arredondar(valores, casas = 1) {
  const f = 10 ** casas;
  return Object.fromEntries(
    NUTRIENTES.map((n) => [n, Math.round((valores[n] ?? 0) * f) / f])
  );
}

/**
 * Valores de referência do alimento, com branco virando zero.
 * @returns {{valores: Object, incompleto: boolean, faltando: string[]}}
 */
export function valoresDeReferencia(alimento) {
  const faltando = NUTRIENTES.filter(
    (n) => alimento[n] === null || alimento[n] === undefined || alimento[n] === ''
  );
  const valores = Object.fromEntries(
    NUTRIENTES.map((n) => [n, Number(alimento[n]) || 0])
  );
  const incompleto = faltando.some((n) => NUTRIENTES_OBRIGATORIOS.includes(n));
  return { valores, incompleto, faltando };
}

/**
 * Um alimento numa quantidade (regra de três).
 * @param {Object|undefined} alimento
 * @param {number|null} quantidade
 * @param {string} [unidade] vazia = a do alimento
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
 * Um prato inteiro (uma porção).
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
 * Uma opção de grupo ou um item simples.
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
 * Um item da refeição.
 * Num grupo, o total usa a opção padrão e guarda o mínimo e o máximo.
 * Item livre ("salada à vontade") não entra na conta.
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
 * Menor ou maior valor de cada nutriente entre as opções (por nutriente).
 * @param {(...n: number[]) => number} escolher Math.min ou Math.max
 */
function extremo(opcoes, escolher) {
  return Object.fromEntries(
    NUTRIENTES.map((n) => [n, escolher(...opcoes.map((o) => o.valores[n] ?? 0))])
  );
}

/** Uma refeição inteira. */
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
    /** true quando as opções mudam as kcal. */
    varia: maximo.kcal - minimo.kcal > 0.0001,
    incompleto,
    erros,
  };
}

/**
 * O dia inteiro, com a comparação com as metas.
 * @param {Object} plano
 * @param {Object[]} refeicoes as refeições do plano
 * @param {{alimentos: Map, pratos: Map}} indice
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
 * Tira das refeições os itens e as opções de grupo marcados por `usa`.
 * Se a opção padrão sair, a primeira que sobrar vira padrão.
 * @param {Object[]} refeicoes
 * @param {(itemOuOpcao: Object) => boolean} usa
 * @returns {Object[]} só as refeições que mudaram
 */
export function tirarDasRefeicoes(refeicoes, usa) {
  return refeicoes
    .map((r) => {
      let mudou = false;
      const itens = (r.itens ?? [])
        .map((item) => {
          if (item.tipo === TIPO_ITEM.GRUPO) {
            const opcoes = (item.opcoes ?? []).filter((o) => !usa(o));
            if (opcoes.length === (item.opcoes ?? []).length) return item;
            mudou = true;
            const padraoId = opcoes.some((o) => o.id === item.padraoId)
              ? item.padraoId
              : (opcoes[0]?.id ?? null);
            return { ...item, opcoes, padraoId };
          }
          if (usa(item)) {
            mudou = true;
            return null;
          }
          return item;
        })
        .filter(Boolean);
      return mudou ? { ...r, itens } : null;
    })
    .filter(Boolean);
}

/** Metas do plano. Meta ausente é null, não zero. */
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
 * Diferença entre o total e cada meta.
 * @returns {Object} por nutriente: {meta, total, diferenca, percentual}, ou null sem meta
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
