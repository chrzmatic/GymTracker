/**
 * Comparação entre duas sessões.
 *
 * Os exercícios são pareados primeiro pelo item do treino (`itemId`) e
 * depois pelo exercício. Assim, trocar a alternativa aparece como
 * "alternativa diferente", e não como um removido e um adicionado.
 */

import { metricasDeSeries, metricasVazias, somarMetricas, diferenca } from './metricas.js';
import { TIPOS_CARGA } from '../utils/constantes.js';

/** Situação de um exercício na comparação. */
export const ESTADO = {
  /** Feito nas duas, com o mesmo exercício. */
  COMPARADO: 'comparado',
  /** Mesmo item, exercícios diferentes. */
  DIFERENTE: 'diferente',
  /** Só na sessão mais nova. */
  ADICIONADO: 'adicionado',
  /** Só na sessão mais antiga. */
  REMOVIDO: 'removido',
  /** Opcional e sem séries numa das sessões. */
  PULADO: 'pulado',
};

/** Nome do item: o exercício ou o nome do grupo. */
function nomeDoItem(item, exercicios) {
  const ex = exercicios.get(item.exercicioId);
  if (ex) return ex.nome;
  if (item.nome) return item.nome;
  return 'Exercício removido';
}

/** Séries agrupadas por item. */
function seriesPorItem(series) {
  const mapa = new Map();
  series.forEach((s) => {
    if (!mapa.has(s.itemId)) mapa.set(s.itemId, []);
    mapa.get(s.itemId).push(s);
  });
  return mapa;
}

/**
 * Pareia os itens da sessão antiga (A) com os da nova (B).
 * @returns {{a: Object|null, b: Object|null}[]}
 */
function parear(itensA, itensB) {
  const pares = [];
  const usadosB = new Set();

  // 1ª passada: mesmo item do treino.
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

  // 2ª passada: o que sobrou, pelo exercício.
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

/** Situação de um par (um valor de ESTADO). */
function estadoDoPar(a, b, seriesA, seriesB) {
  if (!a) return ESTADO.ADICIONADO;
  if (!b) return ESTADO.REMOVIDO;

  // Opcional sem séries numa das sessões: foi pulado, não removido.
  const pulouEmA = seriesA === 0 && a.opcional;
  const pulouEmB = seriesB === 0 && b.opcional;
  if (pulouEmA || pulouEmB) return ESTADO.PULADO;

  if (a.exercicioId !== b.exercicioId) return ESTADO.DIFERENTE;
  return ESTADO.COMPARADO;
}

/**
 * Compara duas sessões.
 * @param {Object} params
 * @param {Object} params.sessaoA a mais antiga
 * @param {Object[]} params.seriesA
 * @param {Object} params.sessaoB a mais nova
 * @param {Object[]} params.seriesB
 * @param {Map<string, Object>} params.exercicios
 * @param {number|null} params.pesoA peso corporal na data de A
 * @param {number|null} params.pesoB peso corporal na data de B
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
      /** Nome em cada sessão, quando o exercício mudou. */
      nomeA: a ? nomeDoItem(a, exercicios) : null,
      nomeB: b ? nomeDoItem(b, exercicios) : null,
      /** true se veio de um grupo de alternativas; false se foi substituído na hora. */
      eraGrupo: Boolean(a?.alternativas?.length || b?.alternativas?.length),
      opcional: Boolean(referencia.opcional),
      /** Posição do exercício em cada sessão. */
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
    /** Séries sem peso corporal, sem kg ou sem reps (cada uma tem um aviso). */
    faltando: {
      pesoCorporal: totalA.faltando.pesoCorporal + totalB.faltando.pesoCorporal,
      carga: totalA.faltando.carga + totalB.faltando.carga,
      reps: totalA.faltando.reps + totalB.faltando.reps,
    },
    semPesoCorporal: totalA.faltando.pesoCorporal + totalB.faltando.pesoCorporal > 0,
  };
}

/** Estados que têm números dos dois lados. */
function comparaveis(estado) {
  return estado === ESTADO.COMPARADO;
}

/**
 * Linhas de métrica de um exercício.
 * Sem peso corporal, compara só reps e o kg registrado; no assistido, menos é melhor.
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

/** Uma linha da tabela de comparação. */
function linha(rotulo, antes, depois, unidade = '', maiorEhMelhor = true) {
  return { rotulo, unidade, ...diferenca(antes, depois, maiorEhMelhor) };
}
