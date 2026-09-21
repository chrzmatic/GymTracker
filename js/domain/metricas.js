/**
 * Métricas de séries: carga efetiva, volume, 1RM e diferenças.
 *
 * Funções puras. São a base da comparação entre sessões (Etapa 4) e dos
 * gráficos de progressão (Etapa 5).
 *
 * O conceito central é a **carga efetiva**: o peso que o músculo realmente
 * moveu, que nem sempre é o número escrito na série.
 *
 *  - **Carga** (máquinas, barras): a carga efetiva é o kg registrado.
 *  - **Peso corporal** (barra fixa, paralelas): é o seu peso corporal mais
 *    o kg adicional da anilha ou do cinto.
 *  - **Assistido** (barra fixa na máquina): é o seu peso corporal *menos*
 *    a assistência. É isso que faz "menos assistência = progresso" virar
 *    "mais carga efetiva = progresso", sem precisar de regra invertida.
 *
 * Os dois últimos dependem do peso corporal registrado até a data da
 * sessão. Sem peso registrado a carga efetiva é desconhecida (`null`), e
 * quem chama decide o que fazer — a especificação manda comparar só reps,
 * carga adicional e assistência nesse caso.
 */

import { TIPOS_CARGA } from '../utils/constantes.js';

/**
 * O peso corporal mais recente registrado até uma data (inclusive).
 * @param {{data: string, kg: number}[]} pesos
 * @param {string} data AAAA-MM-DD
 * @returns {number|null} kg, ou null se não houver registro até a data
 */
export function pesoCorporalEm(pesos, data) {
  const ateAData = pesos
    .filter((p) => p.data <= data)
    .sort((a, b) => b.data.localeCompare(a.data));
  return ateAData.length ? ateAData[0].kg : null;
}

/**
 * Carga efetiva de uma série.
 * @param {Object} serie
 * @param {Object|undefined} exercicio
 * @param {number|null} pesoCorporal peso na data da sessão
 * @returns {number|null} null quando não dá para saber
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

/**
 * 1RM estimado pela fórmula de Epley: carga × (1 + reps / 30).
 * @param {number|null} carga carga efetiva
 * @param {number|null} reps
 * @returns {number|null}
 */
export function epley(carga, reps) {
  if (carga === null || carga === undefined) return null;
  if (reps === null || reps === undefined) return null;
  return carga * (1 + reps / 30);
}

/**
 * Calcula as métricas de um conjunto de séries do mesmo exercício.
 *
 * Séries de aquecimento são descartadas antes de qualquer conta, como a
 * especificação pede. Séries sem carga efetiva conhecida entram na
 * contagem de séries e de reps, mas ficam fora das métricas de carga — e
 * a flag `semCargaEfetiva` avisa que o número está incompleto.
 *
 * @param {Object[]} series séries do exercício (podem incluir aquecimento)
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

  // Por que cada série ficou incompleta. Contar separado é o que permite a
  // tela dizer a coisa certa: "registre seu peso corporal" e "faltou
  // anotar as reps" são problemas diferentes, com soluções diferentes.
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
      // Exercício de carga sem kg anotado é um buraco no registro; peso
      // corporal ou assistido sem peso registrado é falta de um dado que
      // mora em outro lugar do app.
      const precisaPeso = (exercicio?.tipoCarga ?? TIPOS_CARGA.CARGA) !== TIPOS_CARGA.CARGA;
      if (precisaPeso && (pesoCorporal === null || pesoCorporal === undefined)) {
        faltando.pesoCorporal += 1;
      } else {
        faltando.carga += 1;
      }
      return;
    }

    cargaMaxima = cargaMaxima === null ? efetiva : Math.max(cargaMaxima, efetiva);

    // Volume e 1RM só entram com carga **e** reps conhecidas. Tratar reps
    // em branco como zero somaria zero ao volume e faria a sessão parecer
    // pior do que foi — exatamente o erro que o "não sei" evita.
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
    // Média ponderada pelas reps: uma série de 10 pesa o dobro de uma de 5.
    cargaMedia: repsNoVolume ? volume / repsNoVolume : null,
    rm,
    cargaRegistradaMaxima,
    faltando,
    /** Alguma série ficou sem carga efetiva (por falta de kg ou de peso). */
    semCargaEfetiva: faltando.carga + faltando.pesoCorporal > 0,
    /** Alguma série foi feita mas ficou sem reps anotadas. */
    semReps: faltando.reps > 0,
  };
}

/** Métricas de um exercício que não foi feito. */
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
 * Soma as métricas de vários exercícios num total da sessão.
 *
 * Volume e reps somam. Carga máxima e 1RM **não** somam: o máximo de
 * exercícios diferentes não significa nada junto, então o total usa a
 * média das cargas ponderada pelas reps, que é comparável entre sessões.
 *
 * @param {Object[]} lista resultados de metricasDeSeries
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
 *
 * @param {number|null} antes
 * @param {number|null} depois
 * @param {boolean} [maiorEhMelhor] false para assistência, onde menos é melhor
 * @returns {{antes: number|null, depois: number|null, absoluta: number|null, percentual: number|null, direcao: 'melhora'|'piora'|'igual'|'—'}}
 */
export function diferenca(antes, depois, maiorEhMelhor = true) {
  const vazio = antes === null || antes === undefined || depois === null || depois === undefined;
  if (vazio) {
    return { antes: antes ?? null, depois: depois ?? null, absoluta: null, percentual: null, direcao: '—' };
  }

  const absoluta = depois - antes;
  // Percentual só faz sentido com base diferente de zero.
  const percentual = antes === 0 ? null : (absoluta / Math.abs(antes)) * 100;

  let direcao = 'igual';
  if (absoluta !== 0) direcao = absoluta > 0 === maiorEhMelhor ? 'melhora' : 'piora';

  return { antes, depois, absoluta, percentual, direcao };
}
