/**
 * Casos de uso da sessão de treino: iniciar, retomar, registrar séries,
 * finalizar e apagar.
 *
 * Tudo é salvo na hora, a cada alteração: se o celular bloquear ou o app
 * fechar no meio do treino, nada se perde.
 */

import { novoId } from '../utils/id.js';
import { hojeIso } from '../utils/date.js';
import {
  STATUS,
  listarSessoes,
  listarSessoesDaData,
  buscarSessao,
  buscarSessaoEmAndamento,
  salvarSessao,
  removerSessao,
} from '../data/sessoes-repo.js';
import {
  listarSeriesDaSessao,
  listarTodasSeries,
  salvarSerie,
  removerSerie,
  removerSeriesDaSessao,
} from '../data/series-repo.js';
import { buscarTreino } from '../data/treinos-repo.js';
import { mapaExercicios } from '../data/exercicios-repo.js';
import {
  montarSessao,
  montarSerie,
  ultimaVezDoExercicio,
  valoresIniciaisDaSerie,
  itemDaSessao,
  renumerar,
  ordenarSeries,
  proximoNumero,
  alternarAquecimento,
  moverItem as moverItemNaLista,
} from '../domain/sessao.js';

/**
 * Inicia uma sessão a partir de um modelo de treino.
 * Sessões em data passada entram direto como finalizadas.
 * @param {string} treinoId
 * @param {string} [data] AAAA-MM-DD (padrão: hoje)
 * @returns {Promise<Object>} a sessão criada
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
 * Carrega uma sessão com suas séries e os exercícios envolvidos.
 * @param {string} sessaoId
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

/**
 * Sessão em andamento, se existir.
 * @returns {Promise<Object|undefined>}
 */
export function sessaoEmAndamento() {
  return buscarSessaoEmAndamento();
}

/**
 * Atualiza campos soltos da sessão (anotação, itens, status).
 * @param {Object} sessao sessão já modificada
 * @returns {Promise<void>}
 */
export function atualizarSessao(sessao) {
  return salvarSessao(sessao);
}

/**
 * Finaliza a sessão.
 * @param {Object} sessao
 * @returns {Promise<Object>} a sessão finalizada
 */
export async function finalizarSessao(sessao) {
  const atualizada = {
    ...sessao,
    status: STATUS.FINALIZADA,
    finalizadaEm: Date.now(),
  };
  await salvarSessao(atualizada);
  return atualizada;
}

/**
 * Reabre uma sessão finalizada para edição.
 * @param {Object} sessao
 * @returns {Promise<Object>}
 */
export async function reabrirSessao(sessao) {
  const atualizada = { ...sessao, status: STATUS.EM_ANDAMENTO };
  await salvarSessao(atualizada);
  return atualizada;
}

/**
 * Apaga a sessão e todas as suas séries.
 * @param {string} sessaoId
 * @returns {Promise<void>}
 */
export async function apagarSessao(sessaoId) {
  await removerSeriesDaSessao(sessaoId);
  await removerSessao(sessaoId);
}

/**
 * O que foi feito da última vez nesse exercício, antes da data da sessão.
 * @param {Object} sessao sessão atual
 * @param {string} exercicioId
 * @returns {Promise<{sessao: Object, series: Object[]}|null>}
 */
export async function ultimaVez(sessao, exercicioId) {
  const [sessoes, series] = await Promise.all([listarSessoes(), listarTodasSeries()]);
  return ultimaVezDoExercicio(sessoes, series, exercicioId, sessao.data, sessao.id);
}

/**
 * Mesma coisa para vários exercícios de uma vez, lendo o banco uma só vez.
 * A tela de sessão usa esta versão para não repetir a leitura por exercício.
 * @param {Object} sessao
 * @param {string[]} exercicioIds
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
    ])
  );
}

/**
 * Acrescenta uma série a um item da sessão, já pré-preenchida.
 *
 * Aquecimento e séries valendo têm numeração própria, e a ordem na tela põe
 * os aquecimentos na frente — então "+ aquecimento" sempre entra no começo
 * do exercício, mesmo que já existam séries valendo registradas.
 *
 * @param {Object} sessao
 * @param {Object} item item da sessão
 * @param {Object[]} seriesDoItem séries já registradas para esse item
 * @param {boolean} [aquecimento]
 * @returns {Promise<Object>} a série criada
 */
export async function adicionarSerie(sessao, item, seriesDoItem, aquecimento = false) {
  const anterior = await ultimaVez(sessao, item.exercicioId);
  const { carga, reps } = valoresIniciaisDaSerie(
    item,
    seriesDoItem,
    anterior,
    aquecimento
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

/**
 * Marca ou desmarca uma série como aquecimento.
 *
 * Não é só um sinalizador: a série muda de grupo, vai para o começo (ou volta
 * para o meio das séries valendo) e os dois grupos são renumerados.
 *
 * @param {string} serieId
 * @param {Object[]} seriesDoItem séries do item, incluindo a que vai mudar
 * @returns {Promise<void>}
 */
export async function alternarAquecimentoDaSerie(serieId, seriesDoItem) {
  const atualizadas = alternarAquecimento(seriesDoItem, serieId);
  await Promise.all(atualizadas.map(salvarSerie));
}

/**
 * Grava a alteração de uma série (carga, reps, aquecimento ou anotação).
 * @param {Object} serie
 * @returns {Promise<void>}
 */
export function atualizarSerie(serie) {
  return salvarSerie(serie);
}

/**
 * Apaga uma série e renumera as que sobraram no mesmo item.
 * @param {string} serieId
 * @param {Object[]} seriesDoItem séries do item, incluindo a que será apagada
 * @returns {Promise<void>}
 */
export async function apagarSerie(serieId, seriesDoItem) {
  await removerSerie(serieId);
  const restantes = renumerar(seriesDoItem.filter((s) => s.id !== serieId));
  await Promise.all(restantes.map(salvarSerie));
}

/**
 * Troca a alternativa escolhida de um item de grupo, movendo as séries já
 * registradas para o novo exercício.
 * @param {Object} sessao
 * @param {string} itemId
 * @param {string} exercicioId nova alternativa
 * @param {Object[]} seriesDoItem
 * @returns {Promise<Object>} sessão atualizada
 */
export async function trocarAlternativa(sessao, itemId, exercicioId, seriesDoItem) {
  const itens = sessao.itens.map((i) =>
    i.itemId === itemId ? { ...i, exercicioId } : i
  );
  const atualizada = { ...sessao, itens };
  await salvarSessao(atualizada);
  await Promise.all(
    seriesDoItem.map((s) => salvarSerie({ ...s, exercicioId }))
  );
  return atualizada;
}

/**
 * Troca o exercício de um item da sessão, mantendo o lugar dele no treino.
 *
 * Diferente de remover e adicionar: o item guarda o mesmo `itemId`, então
 * a comparação entre sessões reconhece que foi a **mesma vaga do treino**
 * preenchida com outro exercício, e mostra "exercício diferente" em vez de
 * um removido e um adicionado soltos. A posição no treino e as séries
 * planejadas também se preservam.
 *
 * As séries já registradas podem ir junto ou ser apagadas — quem decide é
 * a tela, porque depende de você ter feito aquelas séries no exercício
 * antigo ou ter só deixado a linha aberta.
 *
 * @param {Object} sessao
 * @param {string} itemId
 * @param {string} exercicioId exercício novo
 * @param {Object[]} seriesDoItem séries já registradas para o item
 * @param {'mover'|'apagar'} [oQueFazerComAsSeries]
 * @returns {Promise<Object>} sessão atualizada
 */
export async function substituirExercicio(
  sessao,
  itemId,
  exercicioId,
  seriesDoItem,
  oQueFazerComAsSeries = 'mover'
) {
  const itens = sessao.itens.map((i) =>
    i.itemId === itemId
      ? {
          ...i,
          exercicioId,
          // Um item de grupo que recebe um exercício de fora deixa de ser
          // grupo: as alternativas não valem mais para o que está ali.
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

/**
 * Acrescenta um exercício avulso à sessão, sem mexer no modelo do treino.
 * @param {Object} sessao
 * @param {string} exercicioId
 * @returns {Promise<Object>} sessão atualizada
 */
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
    sessao.itens.length
  );
  item.doModelo = false;
  const atualizada = { ...sessao, itens: [...sessao.itens, item] };
  await salvarSessao(atualizada);
  return atualizada;
}

/**
 * Remove um item da sessão (e suas séries), sem alterar o modelo.
 * @param {Object} sessao
 * @param {string} itemId
 * @param {Object[]} seriesDoItem
 * @returns {Promise<Object>} sessão atualizada
 */
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
 * Sobe ou desce um exercício dentro da sessão.
 *
 * A ordem em que os exercícios foram feitos fica gravada na sessão, porque
 * ela muda o resultado: o que vem no fim do treino pega mais fadiga.
 *
 * @param {Object} sessao
 * @param {string} itemId
 * @param {-1|1} direcao -1 sobe, 1 desce
 * @returns {Promise<Object>} sessão atualizada (a mesma, se não deu para mover)
 */
export async function moverItem(sessao, itemId, direcao) {
  const itens = moverItemNaLista(sessao.itens, itemId, direcao);
  if (!itens) return sessao;
  const atualizada = { ...sessao, itens };
  await salvarSessao(atualizada);
  await sincronizarOrdemDasSeries(atualizada);
  return atualizada;
}

/**
 * Copia a ordem dos itens para as séries (`ordemItem`), que é o que mantém a
 * ordenação da lista de séries de uma sessão inteira.
 * @param {Object} sessao sessão já com os itens na ordem final
 * @returns {Promise<void>}
 */
async function sincronizarOrdemDasSeries(sessao) {
  const ordemPorItem = new Map(sessao.itens.map((i) => [i.itemId, i.ordem]));
  const series = await listarSeriesDaSessao(sessao.id);
  const desatualizadas = series.filter(
    (s) => ordemPorItem.has(s.itemId) && s.ordemItem !== ordemPorItem.get(s.itemId)
  );
  await Promise.all(
    desatualizadas.map((s) => salvarSerie({ ...s, ordemItem: ordemPorItem.get(s.itemId) }))
  );
}

/**
 * Séries de uma sessão já na ordem de exibição.
 * @param {string} sessaoId
 * @returns {Promise<Object[]>}
 */
export async function seriesDaSessao(sessaoId) {
  return ordenarSeries(await listarSeriesDaSessao(sessaoId));
}

/**
 * Todas as sessões com um resumo do que foi feito, para a tela de histórico.
 *
 * Lê o banco inteiro uma vez só e agrupa em memória, em vez de consultar
 * por sessão: com um ano de treino ainda são poucos milhares de registros,
 * e uma leitura só é mais rápida que centenas de transações.
 *
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
