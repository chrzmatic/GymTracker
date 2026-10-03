/**
 * Sessão de treino: iniciar, registrar séries, finalizar e apagar.
 * Tudo é salvo a cada alteração.
 */

import { novoId } from '../utils/id.js';
import { hojeIso } from '../utils/date.js';
import {
  buscarSessao,
  buscarSessaoEmAndamento,
  listarSessoes,
  listarSessoesDaData,
  removerSessao,
  salvarSessao,
  STATUS,
} from '../data/sessoes-repo.js';
import {
  listarSeriesDaSessao,
  listarTodasSeries,
  removerSerie,
  removerSeriesDaSessao,
  salvarSerie,
} from '../data/series-repo.js';
import { buscarTreino } from '../data/treinos-repo.js';
import { mapaExercicios } from '../data/exercicios-repo.js';
import { dadosMudaram } from '../sync/gatilho.js';
import {
  alternarAquecimento,
  itemDaSessao,
  montarSerie,
  montarSessao,
  moverItem as moverItemNaLista,
  ordenarSeries,
  proximoNumero,
  renumerar,
  ultimaVezDoExercicio,
  valoresIniciaisDaSerie,
} from '../domain/sessao.js';

/**
 * Inicia uma sessão. Em data passada, já entra finalizada.
 * @param {string} treinoId
 * @param {string} [data] AAAA-MM-DD (padrão: hoje)
 */
export async function iniciarSessao(treinoId, data = hojeIso()) {
  const treino = await buscarTreino(treinoId);
  if (!treino) throw new Error('Treino não encontrado.');

  const retroativa = data < hojeIso();
  const sessao = montarSessao({
    id: novoId('ses'),
    data,
    treino,
    finalizada: retroativa,
  });
  await salvarSessao(sessao);
  return sessao;
}

/**
 * Sessão com séries e exercícios, ou null.
 * @returns {Promise<{sessao: Object, series: Object[], exercicios: Map<string, Object>}|null>}
 */
export async function carregarSessao(sessaoId) {
  const sessao = await buscarSessao(sessaoId);
  if (!sessao) return null;
  const [series, exercicios] = await Promise.all([
    listarSeriesDaSessao(sessaoId),
    mapaExercicios(),
  ]);
  return { sessao, series: ordenarSeries(series), exercicios };
}

export function sessaoEmAndamento() {
  return buscarSessaoEmAndamento();
}

/** Grava a sessão já alterada. */
export function atualizarSessao(sessao) {
  return salvarSessao(sessao);
}

export async function finalizarSessao(sessao) {
  const atualizada = {
    ...sessao,
    status: STATUS.FINALIZADA,
    finalizadaEm: Date.now(),
  };
  await salvarSessao(atualizada);
  // Fim de treino manda o backup na hora, sem esperar.
  dadosMudaram('sessao');
  return atualizada;
}

export async function reabrirSessao(sessao) {
  const atualizada = { ...sessao, status: STATUS.EM_ANDAMENTO };
  await salvarSessao(atualizada);
  return atualizada;
}

/** Apaga a sessão e as séries dela. */
export async function apagarSessao(sessaoId) {
  await removerSeriesDaSessao(sessaoId);
  await removerSessao(sessaoId);
}

/**
 * Última vez do exercício antes desta sessão.
 * @returns {Promise<{sessao: Object, series: Object[]}|null>}
 */
export async function ultimaVez(sessao, exercicioId) {
  const [sessoes, series] = await Promise.all([listarSessoes(), listarTodasSeries()]);
  return ultimaVezDoExercicio(sessoes, series, exercicioId, sessao.data, sessao.id);
}

/**
 * `ultimaVez` para vários exercícios, lendo o banco uma vez.
 * @returns {Promise<Map<string, {sessao: Object, series: Object[]}|null>>}
 */
export async function ultimasVezes(sessao, exercicioIds) {
  const [todasSessoes, todasSeries] = await Promise.all([
    listarSessoes(),
    listarTodasSeries(),
  ]);
  return new Map(
    exercicioIds.map((id) => [
      id,
      ultimaVezDoExercicio(todasSessoes, todasSeries, id, sessao.data, sessao.id),
    ]),
  );
}

/**
 * Acrescenta uma série já preenchida. Aquecimento entra no começo do exercício.
 * @param {Object} sessao
 * @param {Object} item da sessão
 * @param {Object[]} seriesDoItem já registradas
 * @param {boolean} [aquecimento]
 */
export async function adicionarSerie(sessao, item, seriesDoItem, aquecimento = false) {
  const anterior = await ultimaVez(sessao, item.exercicioId);
  const { carga, reps } = valoresIniciaisDaSerie(
    item,
    seriesDoItem,
    anterior,
    aquecimento,
  );
  const serie = montarSerie({
    id: novoId('ser'),
    sessaoId: sessao.id,
    item,
    numero: proximoNumero(seriesDoItem, aquecimento),
    carga,
    reps,
    aquecimento,
  });
  await salvarSerie(serie);
  return serie;
}

/** Alterna aquecimento numa série e renumera. */
export async function alternarAquecimentoDaSerie(serieId, seriesDoItem) {
  const atualizadas = alternarAquecimento(seriesDoItem, serieId);
  await Promise.all(atualizadas.map(salvarSerie));
}

/** Grava uma série alterada. */
export function atualizarSerie(serie) {
  return salvarSerie(serie);
}

/** Apaga uma série e renumera as que sobram. */
export async function apagarSerie(serieId, seriesDoItem) {
  await removerSerie(serieId);
  const restantes = renumerar(seriesDoItem.filter((s) => s.id !== serieId));
  await Promise.all(restantes.map(salvarSerie));
}

/** Troca a alternativa do grupo e leva as séries junto. */
export async function trocarAlternativa(sessao, itemId, exercicioId, seriesDoItem) {
  const itens = sessao.itens.map((i) => i.itemId === itemId ? { ...i, exercicioId } : i);
  const atualizada = { ...sessao, itens };
  await salvarSessao(atualizada);
  await Promise.all(
    seriesDoItem.map((s) => salvarSerie({ ...s, exercicioId })),
  );
  return atualizada;
}

/**
 * Troca o exercício de um item, mantendo o lugar dele no treino.
 * Como o `itemId` não muda, a comparação mostra "exercício substituído".
 * @param {Object} sessao
 * @param {string} itemId
 * @param {string} exercicioId o novo
 * @param {Object[]} seriesDoItem
 * @param {'mover'|'apagar'} [oQueFazerComAsSeries]
 */
export async function substituirExercicio(
  sessao,
  itemId,
  exercicioId,
  seriesDoItem,
  oQueFazerComAsSeries = 'mover',
) {
  const itens = sessao.itens.map((i) =>
    i.itemId === itemId
      ? {
        ...i,
        exercicioId,
        // Recebeu um exercício de fora: deixa de ser grupo.
        tipo: 'exercicio',
        nome: null,
        alternativas: null,
        substituido: true,
      }
      : i
  );
  const atualizada = { ...sessao, itens };
  await salvarSessao(atualizada);

  if (oQueFazerComAsSeries === 'apagar') {
    await Promise.all(seriesDoItem.map((s) => removerSerie(s.id)));
  } else {
    await Promise.all(seriesDoItem.map((s) => salvarSerie({ ...s, exercicioId })));
  }

  return atualizada;
}

/** Acrescenta um exercício à sessão (o modelo não muda). */
export async function adicionarExercicio(sessao, exercicioId) {
  const item = itemDaSessao(
    {
      id: novoId('it'),
      tipo: 'exercicio',
      exercicioId,
      seriesPlanejadas: 3,
      repsPlanejadas: null,
      opcional: false,
    },
    sessao.itens.length,
  );
  item.doModelo = false;
  const atualizada = { ...sessao, itens: [...sessao.itens, item] };
  await salvarSessao(atualizada);
  return atualizada;
}

/** Tira um item e as séries dele (o modelo não muda). */
export async function removerItem(sessao, itemId, seriesDoItem) {
  await Promise.all(seriesDoItem.map((s) => removerSerie(s.id)));
  const itens = sessao.itens
    .filter((i) => i.itemId !== itemId)
    .sort((a, b) => a.ordem - b.ordem)
    .map((i, ordem) => ({ ...i, ordem }));
  const atualizada = { ...sessao, itens };
  await salvarSessao(atualizada);
  await sincronizarOrdemDasSeries(atualizada);
  return atualizada;
}

/**
 * Sobe (-1) ou desce (1) um exercício. A ordem fica gravada.
 * @returns {Promise<Object>} a sessão (a mesma, se não deu para mover)
 */
export async function moverItem(sessao, itemId, direcao) {
  const itens = moverItemNaLista(sessao.itens, itemId, direcao);
  if (!itens) return sessao;
  const atualizada = { ...sessao, itens };
  await salvarSessao(atualizada);
  await sincronizarOrdemDasSeries(atualizada);
  return atualizada;
}

/** Copia a ordem dos itens para `ordemItem` das séries. */
async function sincronizarOrdemDasSeries(sessao) {
  const ordemPorItem = new Map(sessao.itens.map((i) => [i.itemId, i.ordem]));
  const series = await listarSeriesDaSessao(sessao.id);
  const desatualizadas = series.filter(
    (s) => ordemPorItem.has(s.itemId) && s.ordemItem !== ordemPorItem.get(s.itemId),
  );
  await Promise.all(
    desatualizadas.map((s) =>
      salvarSerie({ ...s, ordemItem: ordemPorItem.get(s.itemId) })
    ),
  );
}

/** Séries da sessão em ordem. */
export async function seriesDaSessao(sessaoId) {
  return ordenarSeries(await listarSeriesDaSessao(sessaoId));
}

/**
 * Sessões com contagem de séries e exercícios, para o histórico.
 * Lê o banco uma vez e agrupa em memória.
 * @returns {Promise<{sessao: Object, series: number, aquecimentos: number, exercicios: number}[]>}
 */
export async function historico() {
  const [todasSessoes, todasSeries] = await Promise.all([
    listarSessoes(),
    listarTodasSeries(),
  ]);

  const porSessao = new Map();
  todasSeries.forEach((s) => {
    if (!porSessao.has(s.sessaoId)) {
      porSessao.set(s.sessaoId, { series: 0, aquecimentos: 0, exercicios: new Set() });
    }
    const r = porSessao.get(s.sessaoId);
    if (s.aquecimento) r.aquecimentos += 1;
    else r.series += 1;
    if (s.exercicioId) r.exercicios.add(s.exercicioId);
  });

  return todasSessoes.map((sessao) => {
    const r = porSessao.get(sessao.id);
    return {
      sessao,
      series: r ? r.series : 0,
      aquecimentos: r ? r.aquecimentos : 0,
      exercicios: r ? r.exercicios.size : 0,
    };
  });
}

export { listarSessoes, listarSessoesDaData, STATUS };
