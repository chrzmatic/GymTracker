/**
 * Regras puras da sessão de treino.
 *
 * Nada aqui toca IndexedDB nem a página: recebe dados e devolve objetos.
 * Isso permite testar a montagem da sessão e o pré-preenchimento das séries
 * isoladamente.
 */

import { STATUS } from '../utils/constantes.js';

/**
 * Cria uma cópia profunda simples de um objeto de dados.
 * Usada para congelar o modelo do treino dentro da sessão.
 * @param {*} valor
 * @returns {*}
 */
export function copiar(valor) {
  return JSON.parse(JSON.stringify(valor));
}

/**
 * Converte um item do modelo de treino no item de trabalho da sessão.
 * Em grupos de alternativas, começa na alternativa padrão.
 * @param {Object} item item do modelo
 * @param {number} ordem posição do item na sessão
 * @returns {Object} item da sessão
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
 * Monta uma sessão nova a partir de um modelo de treino.
 * @param {Object} params
 * @param {string} params.id ID da sessão
 * @param {string} params.data data local AAAA-MM-DD
 * @param {Object} params.treino modelo de treino
 * @param {boolean} [params.finalizada] true para registro retroativo
 * @param {number} [params.agora] timestamp (injetável para teste)
 * @returns {Object} sessão pronta para gravar
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
 * Última sessão finalizada de um exercício antes de uma data.
 *
 * Usada pelo pré-preenchimento: numa sessão retroativa vale a última sessão
 * *anterior à data escolhida*, não a mais recente do banco.
 *
 * @param {Object[]} sessoes todas as sessões
 * @param {Object[]} series todas as séries
 * @param {string} exercicioId
 * @param {string} dataLimite AAAA-MM-DD (exclusiva por data, ver ignorarSessaoId)
 * @param {string} [ignorarSessaoId] sessão a desconsiderar (a atual)
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

/**
 * Ordem canônica das séries: primeiro por exercício (ordem do item na
 * sessão), depois as de aquecimento e por fim as séries valendo, cada
 * grupo na própria numeração.
 *
 * Aquecimento vem sempre antes porque é o que acontece na academia: aquece,
 * depois trabalha. E numera à parte (aq 1, aq 2) porque não entra em
 * nenhuma métrica — comparação, volume e séries semanais ignoram.
 *
 * @param {Object} a
 * @param {Object} b
 * @returns {number}
 */
export function compararSeries(a, b) {
  return (
    (a.ordemItem ?? 0) - (b.ordemItem ?? 0) ||
    Number(Boolean(b.aquecimento)) - Number(Boolean(a.aquecimento)) ||
    (a.numero ?? 0) - (b.numero ?? 0)
  );
}

/**
 * Devolve uma cópia da lista na ordem canônica.
 * @param {Object[]} series
 * @returns {Object[]}
 */
export function ordenarSeries(series) {
  return series.slice().sort(compararSeries);
}

/**
 * Número da próxima série de um item, dentro da própria categoria.
 * @param {Object[]} seriesDoItem séries já registradas para o item
 * @param {boolean} aquecimento
 * @returns {number}
 */
export function proximoNumero(seriesDoItem, aquecimento) {
  const mesma = seriesDoItem.filter(
    (s) => Boolean(s.aquecimento) === Boolean(aquecimento)
  );
  return mesma.length + 1;
}

/**
 * Marca ou desmarca uma série como aquecimento, movendo-a para o grupo certo
 * e renumerando os dois grupos.
 * @param {Object[]} seriesDoItem séries do item, em ordem
 * @param {string} serieId
 * @returns {Object[]} lista completa já renumerada
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
 * Regra principal: a série N repete a série N da última vez nesse exercício,
 * cada uma com a própria carga e reps. Se naquele dia foram feitas menos
 * séries, repete a última série desta sessão (o que você acabou de fazer);
 * se não houver nem isso, a última série daquele dia. Na primeira vez do
 * exercício, usa as reps planejadas e deixa a carga em branco.
 *
 * Aquecimento e séries valendo têm numeração e histórico separados: um
 * aquecimento nunca é base para uma série valendo, nem o contrário.
 *
 * @param {Object} item item da sessão
 * @param {Object[]} seriesAtuais séries já registradas nesta sessão para o item
 * @param {{series: Object[]}|null} ultimaVez resultado de ultimaVezDoExercicio
 * @param {boolean} [aquecimento] categoria da série que está sendo criada
 * @returns {{carga: number|null, reps: number|null}}
 */
export function valoresIniciaisDaSerie(item, seriesAtuais, ultimaVez, aquecimento = false) {
  const mesmaCategoria = (s) => Boolean(s.aquecimento) === Boolean(aquecimento);
  const atuais = seriesAtuais.filter(mesmaCategoria).sort((a, b) => a.numero - b.numero);
  const historico = (ultimaVez ? ultimaVez.series : [])
    .filter(mesmaCategoria)
    .sort((a, b) => a.numero - b.numero);

  const valores = (s) => ({ carga: s.carga ?? null, reps: s.reps ?? null });

  // A série nova ocupa a posição seguinte às que já existem nesta sessão.
  const naMesmaPosicao = historico[atuais.length];
  if (naMesmaPosicao) return valores(naMesmaPosicao);

  const ultimaDesta = atuais[atuais.length - 1];
  if (ultimaDesta) return valores(ultimaDesta);

  const ultimaDaquelaVez = historico[historico.length - 1];
  if (ultimaDaquelaVez) return valores(ultimaDaquelaVez);

  return { carga: null, reps: aquecimento ? null : (item.repsPlanejadas ?? null) };
}

/**
 * Cria o objeto de uma série nova.
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.sessaoId
 * @param {Object} params.item item da sessão
 * @param {number} params.numero número da série (1, 2, 3...)
 * @param {number|null} params.carga
 * @param {number|null} params.reps
 * @param {boolean} [params.aquecimento]
 * @returns {Object}
 */
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

/**
 * Renumera as séries de um item após inserção, remoção ou troca de categoria.
 * Aquecimentos e séries valendo são numerados em sequências separadas.
 * @param {Object[]} series séries do item, na ordem desejada
 * @returns {Object[]} as mesmas séries, ordenadas e com `numero` sequencial
 */
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
 * Move um item da sessão uma posição para cima ou para baixo.
 *
 * A ordem dos exercícios importa: num treino full body os últimos exercícios
 * rendem menos por causa da fadiga acumulada. Por isso a ordem fica gravada
 * na sessão, e as sessões seguintes mostram em que posição cada exercício
 * foi feito da última vez.
 *
 * @param {Object[]} itens itens da sessão
 * @param {string} itemId item a mover
 * @param {-1|1} direcao -1 sobe, 1 desce
 * @returns {Object[]|null} nova lista com `ordem` recalculada, ou null se o
 *   item já está na ponta (nada a fazer)
 */
export function moverItem(itens, itemId, direcao) {
  const lista = itens.slice().sort((a, b) => a.ordem - b.ordem);
  const de = lista.findIndex((i) => i.itemId === itemId);
  const para = de + direcao;
  if (de < 0 || para < 0 || para >= lista.length) return null;
  [lista[de], lista[para]] = [lista[para], lista[de]];
  return lista.map((item, ordem) => ({ ...item, ordem }));
}
