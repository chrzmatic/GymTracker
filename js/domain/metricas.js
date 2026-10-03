/**
 * Métricas de séries: carga efetiva, volume, 1RM e diferenças.
 *
 * Carga efetiva é o peso que o músculo moveu:
 * - carga: o kg registrado;
 * - peso corporal: seu peso + o kg extra;
 * - assistido: seu peso − a assistência.
 * Sem peso corporal registrado, os dois últimos ficam `null`.
 */

import { TIPOS_CARGA } from '../utils/constantes.js';

/**
 * Peso corporal mais recente até a data (inclusive), ou null.
 * @param {{data: string, kg: number}[]} pesos
 * @param {string} data AAAA-MM-DD
 */
export function pesoCorporalEm(pesos, data) {
  const ateAData = pesos
    .filter((p) => p.data <= data)
    .sort((a, b) => b.data.localeCompare(a.data));
  return ateAData.length ? ateAData[0].kg : null;
}

/**
 * Carga efetiva de uma série, ou null se não dá para saber.
 * @param {Object} serie
 * @param {Object|undefined} exercicio
 * @param {number|null} pesoCorporal peso na data da sessão
 */
export function cargaEfetiva(serie, exercicio, pesoCorporal) {
  const tipo = (exercicio && exercicio.tipoCarga) || TIPOS_CARGA.CARGA;
  const registrada = serie.carga;

  if (tipo === TIPOS_CARGA.CARGA) {
    return registrada === null || registrada === undefined ? null : registrada;
  }

  if (pesoCorporal === null || pesoCorporal === undefined) return null;
  const adicional = registrada ?? 0;

  return tipo === TIPOS_CARGA.ASSISTIDO
    ? pesoCorporal - adicional
    : pesoCorporal + adicional;
}

/** 1RM estimado (Epley): carga × (1 + reps / 30). */
export function epley(carga, reps) {
  if (carga === null || carga === undefined) return null;
  if (reps === null || reps === undefined) return null;
  return carga * (1 + reps / 30);
}

/**
 * Métricas das séries de um exercício. Ignora aquecimento.
 * Séries sem carga efetiva contam em séries e reps, mas não nas métricas de carga.
 * @param {Object[]} series
 * @param {Object|undefined} exercicio
 * @param {number|null} pesoCorporal
 * @returns {{series: number, reps: number, volume: number|null, cargaMaxima: number|null, cargaMedia: number|null, rm: number|null, semCargaEfetiva: boolean, cargaRegistradaMaxima: number|null}}
 */
export function metricasDeSeries(series, exercicio, pesoCorporal) {
  const valendo = series.filter((s) => !s.aquecimento);

  let reps = 0;
  let volume = 0;
  let repsNoVolume = 0;
  let cargaMaxima = null;
  let rm = null;
  let cargaRegistradaMaxima = null;
  let comVolume = 0;

  // O que faltou em cada série, para a tela dar o aviso certo.
  const faltando = { carga: 0, pesoCorporal: 0, reps: 0 };

  valendo.forEach((serie) => {
    const temCarga = serie.carga !== null && serie.carga !== undefined;
    const temReps = serie.reps !== null && serie.reps !== undefined;

    if (temReps) reps += serie.reps;
    else faltando.reps += 1;

    if (temCarga) {
      cargaRegistradaMaxima =
        cargaRegistradaMaxima === null
          ? serie.carga
          : Math.max(cargaRegistradaMaxima, serie.carga);
    }

    const efetiva = cargaEfetiva(serie, exercicio, pesoCorporal);
    if (efetiva === null) {
      // Carga sem kg é falha do registro; peso corporal/assistido sem peso é outro aviso.
      const precisaPeso = (exercicio?.tipoCarga ?? TIPOS_CARGA.CARGA) !== TIPOS_CARGA.CARGA;
      if (precisaPeso && (pesoCorporal === null || pesoCorporal === undefined)) {
        faltando.pesoCorporal += 1;
      } else {
        faltando.carga += 1;
      }
      return;
    }

    cargaMaxima = cargaMaxima === null ? efetiva : Math.max(cargaMaxima, efetiva);

    // Volume e 1RM só com carga e reps conhecidas; reps em branco não contam como zero.
    if (temReps) {
      comVolume += 1;
      volume += efetiva * serie.reps;
      repsNoVolume += serie.reps;
      const estimado = epley(efetiva, serie.reps);
      if (estimado !== null) rm = rm === null ? estimado : Math.max(rm, estimado);
    }
  });

  return {
    series: valendo.length,
    reps,
    volume: comVolume ? volume : null,
    cargaMaxima,
    // Média ponderada pelas reps.
    cargaMedia: repsNoVolume ? volume / repsNoVolume : null,
    rm,
    cargaRegistradaMaxima,
    faltando,
    /** Alguma série sem carga efetiva. */
    semCargaEfetiva: faltando.carga + faltando.pesoCorporal > 0,
    /** Alguma série sem reps. */
    semReps: faltando.reps > 0,
  };
}

/** Métricas de um exercício não feito. */
export function metricasVazias() {
  return {
    series: 0,
    reps: 0,
    volume: null,
    cargaMaxima: null,
    cargaMedia: null,
    rm: null,
    cargaRegistradaMaxima: null,
    faltando: { carga: 0, pesoCorporal: 0, reps: 0 },
    semCargaEfetiva: false,
    semReps: false,
  };
}

/**
 * Total da sessão. Volume e reps somam; a carga vira média ponderada pelas reps.
 * @returns {{series: number, reps: number, volume: number|null, cargaMedia: number|null, semCargaEfetiva: boolean}}
 */
export function somarMetricas(lista) {
  let series = 0;
  let reps = 0;
  let volume = 0;
  let temVolume = false;
  let repsNoVolume = 0;
  const faltando = { carga: 0, pesoCorporal: 0, reps: 0 };

  lista.forEach((m) => {
    series += m.series;
    reps += m.reps;
    if (m.volume !== null) {
      volume += m.volume;
      temVolume = true;
    }
    if (m.cargaMedia !== null && m.volume !== null) {
      repsNoVolume += m.volume / m.cargaMedia;
    }
    faltando.carga += m.faltando?.carga ?? 0;
    faltando.pesoCorporal += m.faltando?.pesoCorporal ?? 0;
    faltando.reps += m.faltando?.reps ?? 0;
  });

  return {
    series,
    reps,
    volume: temVolume ? volume : null,
    cargaMedia: repsNoVolume ? volume / repsNoVolume : null,
    faltando,
    semCargaEfetiva: faltando.carga + faltando.pesoCorporal > 0,
    semReps: faltando.reps > 0,
  };
}

/**
 * Diferença entre dois valores, com percentual e direção.
 * @param {number|null} antes
 * @param {number|null} depois
 * @param {boolean} [maiorEhMelhor] false no assistido
 * @returns {{antes: number|null, depois: number|null, absoluta: number|null, percentual: number|null, direcao: 'melhora'|'piora'|'igual'|'—'}}
 */
export function diferenca(antes, depois, maiorEhMelhor = true) {
  const vazio = antes === null || antes === undefined || depois === null || depois === undefined;
  if (vazio) {
    return { antes: antes ?? null, depois: depois ?? null, absoluta: null, percentual: null, direcao: '—' };
  }

  const absoluta = depois - antes;
  // Sem percentual quando o valor de antes é zero.
  const percentual = antes === 0 ? null : (absoluta / Math.abs(antes)) * 100;

  let direcao = 'igual';
  if (absoluta !== 0) direcao = absoluta > 0 === maiorEhMelhor ? 'melhora' : 'piora';

  return { antes, depois, absoluta, percentual, direcao };
}
