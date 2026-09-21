/**
 * Comparação entre duas sessões (especificação, seção 6.5).
 *
 * Função pura: recebe as duas sessões com suas séries, os exercícios e o
 * peso corporal de cada data, e devolve a tabela pronta.
 *
 * **Como os exercícios são pareados.** Primeiro pelo `itemId`, que é o ID
 * do item no modelo do treino e sobrevive a trocas de exercício. Depois,
 * para o que sobrou, pelo `exercicioId` — assim um exercício avulso
 * adicionado na mão em cada sessão ainda pareia. O que não parear de jeito
 * nenhum é "adicionado" ou "removido".
 *
 * Parear pelo item, e não só pelo exercício, é o que permite dizer
 * "alternativas diferentes" em vez de mostrar um exercício removido e
 * outro adicionado quando você escolheu o face pull num dia e o voador no
 * outro.
 */

import { metricasDeSeries, metricasVazias, somarMetricas, diferenca } from './metricas.js';
import { TIPOS_CARGA } from '../utils/constantes.js';

/** Situação de um exercício na comparação. */
export const ESTADO = {
  /** Feito nas duas sessões, com o mesmo exercício. */
  COMPARADO: 'comparado',
  /** Mesmo item, exercícios diferentes (alternativas, ou troca na sessão). */
  DIFERENTE: 'diferente',
  /** Existe só na sessão mais nova. */
  ADICIONADO: 'adicionado',
  /** Existe só na sessão mais antiga. */
  REMOVIDO: 'removido',
  /** Está nas duas, mas ficou sem série numa delas, e é opcional. */
  PULADO: 'pulado',
};

/**
 * Nome de exibição de um item da sessão.
 * @param {Object} item
 * @param {Map<string, Object>} exercicios
 * @returns {string}
 */
function nomeDoItem(item, exercicios) {
  const ex = exercicios.get(item.exercicioId);
  if (ex) return ex.nome;
  if (item.nome) return item.nome;
  return 'Exercício removido';
}

/**
 * Agrupa as séries de uma sessão por item.
 * @param {Object[]} series
 * @returns {Map<string, Object[]>}
 */
function seriesPorItem(series) {
  const mapa = new Map();
  series.forEach((s) => {
    if (!mapa.has(s.itemId)) mapa.set(s.itemId, []);
    mapa.get(s.itemId).push(s);
  });
  return mapa;
}

/**
 * Pareia os itens das duas sessões.
 * @param {Object[]} itensA itens da sessão mais antiga
 * @param {Object[]} itensB itens da sessão mais nova
 * @returns {{a: Object|null, b: Object|null}[]}
 */
function parear(itensA, itensB) {
  const pares = [];
  const usadosB = new Set();

  // 1ª passada: mesmo itemId (mesmo item do modelo de treino).
  const porItemB = new Map(itensB.map((i) => [i.itemId, i]));
  itensA.forEach((a) => {
    const b = porItemB.get(a.itemId);
    if (b && !usadosB.has(b.itemId)) {
      usadosB.add(b.itemId);
      pares.push({ a, b });
    } else {
      pares.push({ a, b: null });
    }
  });

  // 2ª passada: para o que sobrou de A, tenta casar pelo exercício.
  const sobrandoB = itensB.filter((i) => !usadosB.has(i.itemId));
  pares.forEach((par) => {
    if (par.b || !par.a.exercicioId) return;
    const b = sobrandoB.find(
      (i) => i.exercicioId === par.a.exercicioId && !usadosB.has(i.itemId)
    );
    if (b) {
      usadosB.add(b.itemId);
      par.b = b;
    }
  });

  // O que sobrou em B só existe na sessão nova.
  itensB.forEach((b) => {
    if (!usadosB.has(b.itemId)) pares.push({ a: null, b });
  });

  return pares;
}

/**
 * Decide a situação de um par.
 * @param {Object|null} a item da sessão antiga
 * @param {Object|null} b item da sessão nova
 * @param {number} seriesA quantas séries valendo em A
 * @param {number} seriesB quantas séries valendo em B
 * @returns {string} um valor de ESTADO
 */
function estadoDoPar(a, b, seriesA, seriesB) {
  if (!a) return ESTADO.ADICIONADO;
  if (!b) return ESTADO.REMOVIDO;

  // Está nas duas, mas ficou sem série numa delas: se é opcional, foi
  // pulado de propósito — a especificação pede que não apareça como
  // "removido".
  const pulouEmA = seriesA === 0 && a.opcional;
  const pulouEmB = seriesB === 0 && b.opcional;
  if (pulouEmA || pulouEmB) return ESTADO.PULADO;

  if (a.exercicioId !== b.exercicioId) return ESTADO.DIFERENTE;
  return ESTADO.COMPARADO;
}

/**
 * Compara duas sessões.
 *
 * @param {Object} params
 * @param {Object} params.sessaoA sessão mais antiga
 * @param {Object[]} params.seriesA
 * @param {Object} params.sessaoB sessão mais nova
 * @param {Object[]} params.seriesB
 * @param {Map<string, Object>} params.exercicios
 * @param {number|null} params.pesoA peso corporal na data de A
 * @param {number|null} params.pesoB peso corporal na data de B
 * @returns {{itens: Object[], total: Object, semPesoCorporal: boolean}}
 */
export function compararSessoes({
  sessaoA,
  seriesA,
  sessaoB,
  seriesB,
  exercicios,
  pesoA,
  pesoB,
}) {
  const porItemA = seriesPorItem(seriesA);
  const porItemB = seriesPorItem(seriesB);

  const itensA = (sessaoA.itens ?? []).slice().sort((x, y) => x.ordem - y.ordem);
  const itensB = (sessaoB.itens ?? []).slice().sort((x, y) => x.ordem - y.ordem);

  const itens = parear(itensA, itensB).map((par) => {
    const { a, b } = par;
    const doA = a ? (porItemA.get(a.itemId) ?? []) : [];
    const doB = b ? (porItemB.get(b.itemId) ?? []) : [];

    const exA = a ? exercicios.get(a.exercicioId) : undefined;
    const exB = b ? exercicios.get(b.exercicioId) : undefined;

    const mA = a ? metricasDeSeries(doA, exA, pesoA) : metricasVazias();
    const mB = b ? metricasDeSeries(doB, exB, pesoB) : metricasVazias();

    const estado = estadoDoPar(a, b, mA.series, mB.series);
    const referencia = b ?? a;

    return {
      estado,
      itemId: referencia.itemId,
      nome: nomeDoItem(referencia, exercicios),
      /** Nome em cada sessão, quando o exercício mudou entre elas. */
      nomeA: a ? nomeDoItem(a, exercicios) : null,
      nomeB: b ? nomeDoItem(b, exercicios) : null,
      /**
       * Se a diferença veio de um grupo de alternativas ou de uma
       * substituição feita na hora. A tela usa isso para escrever
       * "alternativa diferente" ou "exercício substituído".
       */
      eraGrupo: Boolean(a?.alternativas?.length || b?.alternativas?.length),
      opcional: Boolean(referencia.opcional),
      /** Posição do exercício em cada sessão (a ordem influi no rendimento). */
      ordemA: a ? a.ordem + 1 : null,
      ordemB: b ? b.ordem + 1 : null,
      a: mA,
      b: mB,
      metricas: comparaveis(estado)
        ? compararMetricas(mA, mB, exB ?? exA, pesoA, pesoB)
        : null,
    };
  });

  const comparaveisA = itens.filter((i) => i.a.series > 0).map((i) => i.a);
  const comparaveisB = itens.filter((i) => i.b.series > 0).map((i) => i.b);
  const totalA = somarMetricas(comparaveisA);
  const totalB = somarMetricas(comparaveisB);

  return {
    itens,
    total: {
      a: totalA,
      b: totalB,
      metricas: [
        linha('Séries', totalA.series, totalB.series),
        linha('Reps totais', totalA.reps, totalB.reps),
        linha('Volume', totalA.volume, totalB.volume, 'kg'),
        linha('Carga média', totalA.cargaMedia, totalB.cargaMedia, 'kg'),
      ],
    },
    /**
     * Cada buraco tem causa e solução diferentes, então vão separados:
     * falta peso corporal (registrar nas configurações), falta o kg de
     * alguma série, ou falta anotar as reps de alguma série.
     */
    faltando: {
      pesoCorporal: totalA.faltando.pesoCorporal + totalB.faltando.pesoCorporal,
      carga: totalA.faltando.carga + totalB.faltando.carga,
      reps: totalA.faltando.reps + totalB.faltando.reps,
    },
    semPesoCorporal: totalA.faltando.pesoCorporal + totalB.faltando.pesoCorporal > 0,
  };
}

/** Só estes estados têm números dos dois lados para comparar. */
function comparaveis(estado) {
  return estado === ESTADO.COMPARADO;
}

/**
 * Monta as linhas de métrica de um exercício.
 *
 * Quando falta peso corporal (exercício de peso corporal ou assistido sem
 * registro de peso), a especificação manda comparar só reps e o kg
 * registrado — que é a carga adicional ou a assistência. Nesse caso a
 * direção se inverte no assistido: menos assistência é melhor.
 *
 * @param {Object} mA
 * @param {Object} mB
 * @param {Object|undefined} exercicio
 * @param {number|null} pesoA
 * @param {number|null} pesoB
 * @returns {Object[]}
 */
function compararMetricas(mA, mB, exercicio, pesoA, pesoB) {
  const tipo = (exercicio && exercicio.tipoCarga) || TIPOS_CARGA.CARGA;
  const precisaPeso = tipo !== TIPOS_CARGA.CARGA;
  const semPeso = precisaPeso && (pesoA === null || pesoB === null);

  if (semPeso) {
    const rotulo = tipo === TIPOS_CARGA.ASSISTIDO ? 'Assistência' : 'Carga adicional';
    const maiorEhMelhor = tipo !== TIPOS_CARGA.ASSISTIDO;
    return [
      linha('Séries', mA.series, mB.series),
      linha('Reps totais', mA.reps, mB.reps),
      linha(rotulo, mA.cargaRegistradaMaxima, mB.cargaRegistradaMaxima, 'kg', maiorEhMelhor),
    ];
  }

  return [
    linha('Carga máxima', mA.cargaMaxima, mB.cargaMaxima, 'kg'),
    linha('Carga média', mA.cargaMedia, mB.cargaMedia, 'kg'),
    linha('Volume', mA.volume, mB.volume, 'kg'),
    linha('Reps totais', mA.reps, mB.reps),
    linha('Séries', mA.series, mB.series),
    linha('1RM estimado', mA.rm, mB.rm, 'kg'),
  ];
}

/**
 * Uma linha da tabela de comparação.
 * @param {string} rotulo
 * @param {number|null} antes
 * @param {number|null} depois
 * @param {string} [unidade]
 * @param {boolean} [maiorEhMelhor]
 * @returns {Object}
 */
function linha(rotulo, antes, depois, unidade = '', maiorEhMelhor = true) {
  return { rotulo, unidade, ...diferenca(antes, depois, maiorEhMelhor) };
}
