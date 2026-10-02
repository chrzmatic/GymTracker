/**
 * Resumo de uma sessão, só para ler: a tela de visualização rápida e o
 * texto de "copiar".
 *
 * Funções puras. Recebem a sessão, as séries e os exercícios como estão
 * no banco e devolvem a estrutura pronta para desenhar ou o texto pronto
 * para colar. Nada aqui grava, então a tela de resumo nunca muda um
 * treino; ela só reflete o que está salvo no momento em que é desenhada.
 */

import { STATUS, TIPOS_CARGA } from '../utils/constantes.js';
import { ordenarSeries } from './sessao.js';
import { formatarLongo } from '../utils/date.js';

/**
 * Número com vírgula, sem zeros à toa. Igual ao `num` da formatação, mas
 * aqui para o domínio não depender da camada de exibição.
 * @param {number} valor
 * @returns {string}
 */
function numero(valor) {
  const arredondado = Math.round(valor * 100) / 100;
  return String(arredondado).replace('.', ',');
}

/** true para null, undefined, '' e NaN. */
function vazio(valor) {
  return valor === null || valor === undefined || valor === '' || Number.isNaN(valor);
}

/**
 * Texto de uma série: "16 kg × 10", "peso corporal +5 kg × 8",
 * "assistência 20 kg × 6". O que não foi anotado aparece como "—", nunca
 * como zero.
 * @param {{carga: number|null, reps: number|null}} serie
 * @param {string} [tipoCarga]
 * @returns {string}
 */
export function textoDaSerie(serie, tipoCarga = TIPOS_CARGA.CARGA) {
  const reps = vazio(serie.reps) ? '—' : numero(Number(serie.reps));
  const temCarga = !vazio(serie.carga);
  const carga = temCarga ? numero(Number(serie.carga)) : null;

  if (tipoCarga === TIPOS_CARGA.PESO_CORPORAL) {
    const extra = temCarga && Number(serie.carga) !== 0 ? ` +${carga} kg` : '';
    return `peso corporal${extra} × ${reps}`;
  }
  if (tipoCarga === TIPOS_CARGA.ASSISTIDO) {
    return `assistência ${temCarga ? carga : '—'} kg × ${reps}`;
  }
  return `${temCarga ? carga : '—'} kg × ${reps}`;
}

/**
 * Monta o resumo de uma sessão.
 *
 * Os exercícios seguem a ordem gravada na sessão. Séries que não batem
 * com nenhum item (não deveria acontecer, mas um backup antigo ou uma
 * edição interrompida podem deixar) entram no fim, agrupadas pelo
 * exercício: o resumo nunca esconde uma série que está no banco.
 *
 * @param {{sessao: Object, series: Object[], exercicios: Map<string, Object>}} dados
 * @returns {Object}
 */
export function resumirSessao({ sessao, series, exercicios }) {
  const ordenadas = ordenarSeries(series ?? []);
  const itens = (sessao.itens ?? [])
    .slice()
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const idsDosItens = new Set(itens.map((i) => i.itemId));

  const nomeDe = (exercicioId, reserva) => {
    const ex = exercicios.get(exercicioId);
    return ex ? ex.nome : (reserva ?? 'Exercício removido');
  };

  const montarExercicio = (nome, exercicioId, seriesDoItem, extra = {}) => {
    const tipoCarga = exercicios.get(exercicioId)?.tipoCarga ?? TIPOS_CARGA.CARGA;
    let aquecimentos = 0;
    let valendo = 0;
    const linhas = seriesDoItem.map((s) => {
      const rotulo = s.aquecimento ? `aq ${(aquecimentos += 1)}` : String((valendo += 1));
      return {
        id: s.id,
        rotulo,
        aquecimento: Boolean(s.aquecimento),
        carga: vazio(s.carga) ? null : Number(s.carga),
        reps: vazio(s.reps) ? null : Number(s.reps),
        texto: textoDaSerie(s, tipoCarga),
        anotacao: s.anotacao ?? '',
      };
    });
    return {
      nome,
      exercicioId,
      tipoCarga,
      opcional: false,
      ...extra,
      series: linhas,
      feito: linhas.length > 0,
    };
  };

  const lista = itens.map((item) =>
    montarExercicio(
      nomeDe(item.exercicioId, item.nome),
      item.exercicioId,
      ordenadas.filter((s) => s.itemId === item.itemId),
      { itemId: item.itemId, opcional: Boolean(item.opcional) }
    )
  );

  const soltas = ordenadas.filter((s) => !idsDosItens.has(s.itemId));
  const porExercicio = new Map();
  soltas.forEach((s) => {
    if (!porExercicio.has(s.exercicioId)) porExercicio.set(s.exercicioId, []);
    porExercicio.get(s.exercicioId).push(s);
  });
  porExercicio.forEach((doExercicio, exercicioId) =>
    lista.push(
      montarExercicio(nomeDe(exercicioId), exercicioId, doExercicio, { itemId: null })
    )
  );

  lista.forEach((e, i) => {
    e.posicao = i + 1;
  });

  const valendo = ordenadas.filter((s) => !s.aquecimento);
  return {
    sessaoId: sessao.id,
    treinoNome: sessao.treinoNome ?? '',
    cor: sessao.cor ?? null,
    data: sessao.data,
    finalizada: sessao.status === STATUS.FINALIZADA,
    anotacao: (sessao.anotacao ?? '').trim(),
    exercicios: lista,
    totais: {
      exercicios: lista.filter((e) => e.feito).length,
      series: valendo.length,
      aquecimentos: ordenadas.length - valendo.length,
      reps: valendo.reduce((soma, s) => soma + (vazio(s.reps) ? 0 : Number(s.reps)), 0),
    },
  };
}

/**
 * Linha de totais: "5 exercícios · 20 séries · 194 reps".
 * @param {Object} totais
 * @returns {string}
 */
export function textoDosTotais(totais) {
  const p = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  return [
    p(totais.exercicios, 'exercício', 'exercícios'),
    p(totais.series, 'série', 'séries'),
    p(totais.reps, 'rep', 'reps'),
  ].join(' · ');
}

/**
 * Texto para colar em qualquer lugar (WhatsApp, Notas, e-mail).
 *
 * Só texto puro com quebras de linha: sem tabulação nem espaços no começo
 * da linha, que alguns apps comem ao colar e bagunçam o alinhamento. Cada
 * série é um item "- ", que vira lista onde houver markdown e continua
 * legível onde não houver.
 *
 * @param {Object} resumo resultado de resumirSessao
 * @returns {string}
 */
export function textoParaCopiar(resumo) {
  const linhas = [];
  const titulo = `Treino ${resumo.treinoNome} · ${formatarLongo(resumo.data)}`;
  linhas.push(resumo.finalizada ? titulo : `${titulo} (em andamento)`);

  resumo.exercicios.forEach((e) => {
    linhas.push('');
    const marcas = [];
    if (e.opcional) marcas.push('opcional');
    if (!e.feito) marcas.push('não feito');
    linhas.push(
      `${e.posicao}. ${e.nome}${marcas.length ? ` (${marcas.join(', ')})` : ''}`
    );
    e.series.forEach((s) => {
      const nota = s.anotacao ? ` (${s.anotacao})` : '';
      linhas.push(`- ${s.aquecimento ? 'aq: ' : ''}${s.texto}${nota}`);
    });
  });

  if (resumo.anotacao) {
    linhas.push('');
    linhas.push(`Anotação: ${resumo.anotacao}`);
  }

  linhas.push('');
  linhas.push(textoDosTotais(resumo.totais));
  return linhas.join('\n');
}
