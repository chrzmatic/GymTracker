/** Regras puras da sessão de treino. */

import { STATUS } from '../utils/constantes.js';

/** Cópia profunda (para guardar o modelo dentro da sessão). */
export function copiar(valor) {
  return JSON.parse(JSON.stringify(valor));
}

/**
 * Item do modelo para item da sessão. Grupo começa na alternativa padrão.
 * @param {Object} item do modelo
 * @param {number} ordem posição na sessão
 */
export function itemDaSessao(item, ordem) {
  return {
    itemId: item.id,
    ordem,
    tipo: item.tipo,
    nome: item.nome ?? null,
    exercicioId:
      item.tipo === 'alternativas' ? item.exercicioPadraoId : item.exercicioId,
    alternativas: item.tipo === 'alternativas' ? [...item.alternativas] : null,
    seriesPlanejadas: item.seriesPlanejadas ?? 3,
    repsPlanejadas: item.repsPlanejadas ?? null,
    opcional: Boolean(item.opcional),
    doModelo: true,
  };
}

/**
 * Sessão nova a partir de um modelo de treino.
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.data AAAA-MM-DD
 * @param {Object} params.treino
 * @param {boolean} [params.finalizada] true para registro retroativo
 * @param {number} [params.agora] timestamp (para teste)
 */
export function montarSessao({ id, data, treino, finalizada = false, agora = Date.now() }) {
  return {
    id,
    data,
    treinoId: treino.id,
    treinoNome: treino.nome,
    cor: treino.cor ?? null,
    naRotacao: Boolean(treino.naRotacao),
    status: finalizada ? STATUS.FINALIZADA : STATUS.EM_ANDAMENTO,
    anotacao: '',
    criadaEm: agora,
    finalizadaEm: finalizada ? agora : null,
    modelo: copiar(treino),
    itens: (treino.itens ?? []).map(itemDaSessao),
  };
}

/**
 * Última sessão com o exercício até a data, ignorando a sessão atual.
 * @param {Object[]} sessoes
 * @param {Object[]} series
 * @param {string} exercicioId
 * @param {string} dataLimite AAAA-MM-DD
 * @param {string} [ignorarSessaoId]
 * @returns {{sessao: Object, series: Object[]}|null}
 */
export function ultimaVezDoExercicio(sessoes, series, exercicioId, dataLimite, ignorarSessaoId) {
  const seriesPorSessao = new Map();
  series.forEach((s) => {
    if (s.exercicioId !== exercicioId) return;
    if (!seriesPorSessao.has(s.sessaoId)) seriesPorSessao.set(s.sessaoId, []);
    seriesPorSessao.get(s.sessaoId).push(s);
  });

  const candidatas = sessoes
    .filter((s) => s.id !== ignorarSessaoId)
    .filter((s) => s.data <= dataLimite)
    .filter((s) => seriesPorSessao.has(s.id))
    .sort((a, b) => b.data.localeCompare(a.data) || (b.criadaEm ?? 0) - (a.criadaEm ?? 0));

  const sessao = candidatas[0];
  if (!sessao) return null;

  const doExercicio = seriesPorSessao
    .get(sessao.id)
    .slice()
    .sort((a, b) => a.numero - b.numero);

  return { sessao, series: doExercicio };
}

/** Ordem das séries: por exercício, aquecimentos primeiro, depois pelo número. */
export function compararSeries(a, b) {
  return (
    (a.ordemItem ?? 0) - (b.ordemItem ?? 0) ||
    Number(Boolean(b.aquecimento)) - Number(Boolean(a.aquecimento)) ||
    (a.numero ?? 0) - (b.numero ?? 0)
  );
}

/** Cópia da lista em ordem. */
export function ordenarSeries(series) {
  return series.slice().sort(compararSeries);
}

/** Número da próxima série, dentro da categoria (aquecimento ou valendo). */
export function proximoNumero(seriesDoItem, aquecimento) {
  const mesma = seriesDoItem.filter(
    (s) => Boolean(s.aquecimento) === Boolean(aquecimento)
  );
  return mesma.length + 1;
}

/**
 * Alterna aquecimento numa série e renumera tudo.
 * @returns {Object[]} lista completa renumerada
 */
export function alternarAquecimento(seriesDoItem, serieId) {
  const trocadas = seriesDoItem.map((s) =>
    s.id === serieId ? { ...s, aquecimento: !s.aquecimento } : s
  );
  return renumerar(trocadas);
}

/**
 * Valores iniciais de uma série nova.
 *
 * Repete a série de mesmo número da última vez. Se não houver, repete a
 * última desta sessão; senão, a última daquele dia. Na primeira vez, usa
 * as reps planejadas e deixa a carga vazia. Aquecimento e valendo não se misturam.
 * @param {Object} item da sessão
 * @param {Object[]} seriesAtuais desta sessão, para o item
 * @param {{series: Object[]}|null} ultimaVez
 * @param {boolean} [aquecimento]
 * @returns {{carga: number|null, reps: number|null}}
 */
export function valoresIniciaisDaSerie(item, seriesAtuais, ultimaVez, aquecimento = false) {
  const mesmaCategoria = (s) => Boolean(s.aquecimento) === Boolean(aquecimento);
  const atuais = seriesAtuais.filter(mesmaCategoria).sort((a, b) => a.numero - b.numero);
  const historico = (ultimaVez ? ultimaVez.series : [])
    .filter(mesmaCategoria)
    .sort((a, b) => a.numero - b.numero);

  const valores = (s) => ({ carga: s.carga ?? null, reps: s.reps ?? null });

  // Posição da série nova nesta sessão.
  const naMesmaPosicao = historico[atuais.length];
  if (naMesmaPosicao) return valores(naMesmaPosicao);

  const ultimaDesta = atuais[atuais.length - 1];
  if (ultimaDesta) return valores(ultimaDesta);

  const ultimaDaquelaVez = historico[historico.length - 1];
  if (ultimaDaquelaVez) return valores(ultimaDaquelaVez);

  return { carga: null, reps: aquecimento ? null : (item.repsPlanejadas ?? null) };
}

/** Objeto de uma série nova. */
export function montarSerie({ id, sessaoId, item, numero, carga, reps, aquecimento = false }) {
  return {
    id,
    sessaoId,
    itemId: item.itemId,
    ordemItem: item.ordem,
    exercicioId: item.exercicioId,
    numero,
    carga: carga ?? null,
    reps: reps ?? null,
    aquecimento,
    anotacao: '',
  };
}

/** Ordena e renumera; aquecimento e valendo em sequências separadas. */
export function renumerar(series) {
  let aquecimentos = 0;
  let valendo = 0;
  return ordenarSeries(series).map((s) =>
    s.aquecimento
      ? { ...s, numero: (aquecimentos += 1) }
      : { ...s, numero: (valendo += 1) }
  );
}

/**
 * Sobe (-1) ou desce (1) um item. A ordem fica gravada porque
 * o último exercício rende menos pelo cansaço.
 * @returns {Object[]|null} nova lista, ou null se já está na ponta
 */
export function moverItem(itens, itemId, direcao) {
  const lista = itens.slice().sort((a, b) => a.ordem - b.ordem);
  const de = lista.findIndex((i) => i.itemId === itemId);
  const para = de + direcao;
  if (de < 0 || para < 0 || para >= lista.length) return null;
  [lista[de], lista[para]] = [lista[para], lista[de]];
  return lista.map((item, ordem) => ({ ...item, ordem }));
}
