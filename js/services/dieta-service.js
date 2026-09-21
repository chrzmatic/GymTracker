/**
 * Casos de uso da dieta.
 *
 * Junta índice, pratos, refeições e planos, e entrega o dia já calculado.
 * Como os planos guardam só alimento e quantidade, qualquer correção no
 * índice aparece na próxima leitura, sem nada para invalidar.
 */

import * as repo from '../data/dieta-repo.js';
import { listarSessoesDaData } from '../data/sessoes-repo.js';
import { novoId, paraSlug } from '../utils/id.js';
import { hojeIso } from '../utils/date.js';
import { calcularPlano, calcularPrato, calcularRefeicao, TIPO_ITEM } from '../domain/nutricao.js';

/**
 * O índice que os cálculos precisam: alimentos e pratos por ID.
 * @returns {Promise<{alimentos: Map, pratos: Map}>}
 */
export async function carregarIndice() {
  const [alimentos, pratos] = await Promise.all([repo.mapaAlimentos(), repo.mapaPratos()]);
  return { alimentos, pratos };
}

/* ------------------------------------------------------------------ */
/* O dia                                                               */
/* ------------------------------------------------------------------ */

/**
 * Qual plano vale numa data.
 *
 * Padrão: dia de treino se há qualquer sessão registrada naquele dia (da
 * rotação ou extra); senão, dia sem treino. Uma escolha manual salva para
 * aquela data tem prioridade — é para o caso de você saber de manhã que
 * vai treinar, antes de ter registrado nada.
 *
 * @param {string} [data] AAAA-MM-DD
 * @returns {Promise<{plano: Object|null, automatico: boolean, treinou: boolean}>}
 */
export async function planoDoDia(data = hojeIso()) {
  const [planos, escolhido, sessoes] = await Promise.all([
    repo.listarPlanos(),
    repo.lerTipoDia(data),
    listarSessoesDaData(data),
  ]);

  if (!planos.length) return { plano: null, automatico: true, treinou: false };

  const treinou = sessoes.length > 0;

  if (escolhido) {
    const manual = planos.find((p) => p.id === escolhido);
    if (manual) return { plano: manual, automatico: false, treinou };
  }

  const tipo = treinou ? 'treino' : 'sem-treino';
  const plano = planos.find((p) => p.tipoDia === tipo) ?? planos[0];
  return { plano, automatico: true, treinou };
}

/**
 * O dia inteiro calculado: refeições, totais, faixa e comparação com a meta.
 * @param {string} planoId
 * @returns {Promise<Object|null>}
 */
export async function calcularDia(planoId) {
  const [plano, refeicoes, indice] = await Promise.all([
    repo.buscarPlano(planoId),
    repo.listarRefeicoes(),
    carregarIndice(),
  ]);
  if (!plano) return null;

  const porId = new Map(refeicoes.map((r) => [r.id, r]));

  // A ordem vem da lista do **plano**, não de um campo na refeição: o
  // jantar é o mesmo objeto nos dois planos e pode ser a 4ª refeição num
  // e a 3ª no outro. Um campo `ordem` na refeição não conseguiria
  // representar as duas posições.
  const doPlano = (plano.refeicoes ?? [])
    .map((id, i) => {
      const refeicao = porId.get(id);
      return refeicao ? { ...refeicao, ordem: i } : null;
    })
    .filter(Boolean);

  return calcularPlano(plano, doPlano, indice);
}

/* ------------------------------------------------------------------ */
/* Refeições de um plano                                               */
/* ------------------------------------------------------------------ */

/**
 * Cria uma refeição e a acrescenta ao fim de um plano.
 * @param {string} planoId
 * @param {string} nome
 * @returns {Promise<Object>} a refeição criada
 */
export async function criarRefeicaoNoPlano(planoId, nome) {
  const plano = await repo.buscarPlano(planoId);
  if (!plano) throw new Error('Plano não encontrado.');

  const refeicao = {
    id: novoId('ref'),
    nome: nome.trim(),
    ordem: (plano.refeicoes ?? []).length,
    itens: [],
  };
  await repo.salvarRefeicao(refeicao);
  await repo.salvarPlano({ ...plano, refeicoes: [...(plano.refeicoes ?? []), refeicao.id] });
  return refeicao;
}

/**
 * Acrescenta ao plano uma refeição que já existe — é assim que uma
 * refeição passa a ser compartilhada pelos dois dias.
 * @param {string} planoId
 * @param {string} refeicaoId
 * @returns {Promise<void>}
 */
export async function adicionarRefeicaoAoPlano(planoId, refeicaoId) {
  const plano = await repo.buscarPlano(planoId);
  if (!plano || (plano.refeicoes ?? []).includes(refeicaoId)) return;
  await repo.salvarPlano({ ...plano, refeicoes: [...(plano.refeicoes ?? []), refeicaoId] });
}

/**
 * Tira uma refeição de um plano.
 *
 * Se ela não estiver em nenhum outro plano, é apagada de vez: uma refeição
 * fora de todos os planos fica invisível no app e só ocuparia espaço.
 *
 * @param {string} planoId
 * @param {string} refeicaoId
 * @returns {Promise<{apagada: boolean}>}
 */
export async function removerRefeicaoDoPlano(planoId, refeicaoId) {
  const [plano, planos] = await Promise.all([repo.buscarPlano(planoId), repo.listarPlanos()]);
  if (!plano) return { apagada: false };

  await repo.salvarPlano({
    ...plano,
    refeicoes: (plano.refeicoes ?? []).filter((id) => id !== refeicaoId),
  });

  const aindaUsada = planos.some(
    (p) => p.id !== planoId && (p.refeicoes ?? []).includes(refeicaoId)
  );
  if (!aindaUsada) {
    await repo.removerRefeicao(refeicaoId);
    return { apagada: true };
  }
  return { apagada: false };
}

/**
 * Sobe ou desce uma refeição dentro de um plano.
 * @param {string} planoId
 * @param {string} refeicaoId
 * @param {-1|1} direcao
 * @returns {Promise<boolean>} false se já estava na ponta
 */
export async function moverRefeicaoNoPlano(planoId, refeicaoId, direcao) {
  const plano = await repo.buscarPlano(planoId);
  if (!plano) return false;

  const lista = (plano.refeicoes ?? []).slice();
  const de = lista.indexOf(refeicaoId);
  const para = de + direcao;
  if (de < 0 || para < 0 || para >= lista.length) return false;

  [lista[de], lista[para]] = [lista[para], lista[de]];
  await repo.salvarPlano({ ...plano, refeicoes: lista });
  return true;
}

/**
 * Renomeia uma refeição. Como ela pode ser compartilhada, o nome muda nos
 * dois planos — o que é o esperado: é a mesma refeição.
 * @param {string} refeicaoId
 * @param {string} nome
 * @returns {Promise<void>}
 */
export async function renomearRefeicao(refeicaoId, nome) {
  const refeicao = await repo.buscarRefeicao(refeicaoId);
  if (!refeicao) return;
  await repo.salvarRefeicao({ ...refeicao, nome: nome.trim() });
}

/**
 * Refeições que existem mas não estão neste plano, para oferecer no
 * "usar uma refeição que já existe".
 * @param {string} planoId
 * @returns {Promise<Object[]>}
 */
export async function refeicoesForaDoPlano(planoId) {
  const [plano, refeicoes] = await Promise.all([
    repo.buscarPlano(planoId),
    repo.listarRefeicoes(),
  ]);
  const dentro = new Set(plano?.refeicoes ?? []);
  return refeicoes.filter((r) => !dentro.has(r.id));
}

/**
 * Renomeia um plano.
 * @param {string} planoId
 * @param {string} nome
 * @returns {Promise<void>}
 */
export async function renomearPlano(planoId, nome) {
  const plano = await repo.buscarPlano(planoId);
  if (!plano) return;
  await repo.salvarPlano({ ...plano, nome: nome.trim() });
}

/**
 * Fixa manualmente o plano de uma data.
 * @param {string} data
 * @param {string} planoId
 * @returns {Promise<void>}
 */
export function escolherPlanoDoDia(data, planoId) {
  return repo.salvarTipoDia(data, planoId);
}

/**
 * Volta a decidir o plano automaticamente naquela data.
 * @param {string} data
 * @returns {Promise<void>}
 */
export function voltarAoAutomatico(data) {
  return repo.removerTipoDia(data);
}

/* ------------------------------------------------------------------ */
/* Índice de alimentos                                                 */
/* ------------------------------------------------------------------ */

/**
 * Cria um alimento. O ID sai do nome, para ficar legível no backup.
 * @param {Object} dados
 * @returns {Promise<Object>}
 */
export async function criarAlimento(dados) {
  const slug = paraSlug(dados.nome);
  const desejado = slug ? `alim-${slug}` : novoId('alim');
  const existe = await repo.buscarAlimento(desejado);
  const alimento = {
    id: existe ? novoId('alim') : desejado,
    nome: dados.nome.trim(),
    quantidadeRef: dados.quantidadeRef,
    unidade: dados.unidade,
    kcal: dados.kcal ?? null,
    proteina: dados.proteina ?? null,
    gordura: dados.gordura ?? null,
    carbo: dados.carbo ?? null,
    fibra: dados.fibra ?? null,
    fonte: dados.fonte ?? '',
    generico: Boolean(dados.generico),
    conferir: Boolean(dados.conferir),
  };
  await repo.salvarAlimento(alimento);
  return alimento;
}

/**
 * Grava alterações de um alimento. Editar um valor tira o aviso de
 * [CONFERIR], que é o que a especificação pede.
 * @param {Object} alimento
 * @returns {Promise<Object>}
 */
export async function salvarAlimento(alimento) {
  const limpo = { ...alimento, nome: alimento.nome.trim(), conferir: false };
  await repo.salvarAlimento(limpo);
  return limpo;
}

/**
 * Onde um alimento é usado: pratos compostos e itens de refeição.
 *
 * A especificação proíbe excluir sem avisar onde ele está, porque apagar
 * um ingrediente silenciosamente mudaria o valor de um prato inteiro.
 *
 * @param {string} alimentoId
 * @returns {Promise<{pratos: string[], refeicoes: string[]}>}
 */
export async function ondeAlimentoEUsado(alimentoId) {
  const [pratos, refeicoes] = await Promise.all([repo.listarPratos(), repo.listarRefeicoes()]);

  const nosPratos = pratos
    .filter((p) => (p.ingredientes ?? []).some((i) => i.alimentoId === alimentoId))
    .map((p) => p.nome);

  const nasRefeicoes = refeicoes
    .filter((r) =>
      (r.itens ?? []).some((item) => {
        if (item.tipo === TIPO_ITEM.GRUPO) {
          return (item.opcoes ?? []).some((o) => o.alimentoId === alimentoId);
        }
        return item.alimentoId === alimentoId;
      })
    )
    .map((r) => r.nome);

  return { pratos: nosPratos, refeicoes: [...new Set(nasRefeicoes)] };
}

/**
 * Exclui um alimento e o tira dos pratos e refeições que o usam.
 * @param {string} alimentoId
 * @returns {Promise<void>}
 */
export async function excluirAlimento(alimentoId) {
  const [pratos, refeicoes] = await Promise.all([repo.listarPratos(), repo.listarRefeicoes()]);

  const pratosMudados = pratos
    .filter((p) => (p.ingredientes ?? []).some((i) => i.alimentoId === alimentoId))
    .map((p) => ({
      ...p,
      ingredientes: p.ingredientes.filter((i) => i.alimentoId !== alimentoId),
    }));
  if (pratosMudados.length) await repo.salvarPratos(pratosMudados);

  const refeicoesMudadas = refeicoes
    .map((r) => {
      const itens = (r.itens ?? [])
        .map((item) => {
          if (item.tipo === TIPO_ITEM.GRUPO) {
            const opcoes = (item.opcoes ?? []).filter((o) => o.alimentoId !== alimentoId);
            if (opcoes.length === (item.opcoes ?? []).length) return item;
            const padraoId = opcoes.some((o) => o.id === item.padraoId)
              ? item.padraoId
              : (opcoes[0]?.id ?? null);
            return { ...item, opcoes, padraoId };
          }
          return item.alimentoId === alimentoId ? null : item;
        })
        .filter(Boolean);
      return itens.length === (r.itens ?? []).length &&
        itens.every((item, i) => item === r.itens[i])
        ? null
        : { ...r, itens };
    })
    .filter(Boolean);
  if (refeicoesMudadas.length) await repo.salvarRefeicoes(refeicoesMudadas);

  await repo.removerAlimento(alimentoId);
}

/* ------------------------------------------------------------------ */
/* Pratos compostos                                                    */
/* ------------------------------------------------------------------ */

/**
 * Cria um prato composto vazio.
 * @param {string} nome
 * @returns {Promise<Object>}
 */
export async function criarPrato(nome) {
  const slug = paraSlug(nome);
  const desejado = slug ? `prato-${slug}` : novoId('prato');
  const existe = await repo.buscarPrato(desejado);
  const prato = {
    id: existe ? novoId('prato') : desejado,
    nome: nome.trim(),
    ingredientes: [],
  };
  await repo.salvarPrato(prato);
  return prato;
}

/**
 * Valores calculados de um prato, para mostrar na tela.
 * @param {string} pratoId
 * @returns {Promise<Object|null>}
 */
export async function calcularPratoPorId(pratoId) {
  const [prato, indice] = await Promise.all([repo.buscarPrato(pratoId), carregarIndice()]);
  if (!prato) return null;
  return { prato, ...calcularPrato(prato, indice.alimentos) };
}

/**
 * Onde um prato é usado nas refeições.
 * @param {string} pratoId
 * @returns {Promise<string[]>} nomes das refeições
 */
export async function ondePratoEUsado(pratoId) {
  const refeicoes = await repo.listarRefeicoes();
  return refeicoes
    .filter((r) =>
      (r.itens ?? []).some((item) =>
        item.tipo === TIPO_ITEM.GRUPO
          ? (item.opcoes ?? []).some((o) => o.pratoId === pratoId)
          : item.pratoId === pratoId
      )
    )
    .map((r) => r.nome);
}

/**
 * Exclui um prato e o tira das refeições.
 * @param {string} pratoId
 * @returns {Promise<void>}
 */
export async function excluirPrato(pratoId) {
  const refeicoes = await repo.listarRefeicoes();
  const mudadas = refeicoes
    .map((r) => {
      const itens = (r.itens ?? [])
        .map((item) => {
          if (item.tipo === TIPO_ITEM.GRUPO) {
            const opcoes = (item.opcoes ?? []).filter((o) => o.pratoId !== pratoId);
            if (opcoes.length === (item.opcoes ?? []).length) return item;
            const padraoId = opcoes.some((o) => o.id === item.padraoId)
              ? item.padraoId
              : (opcoes[0]?.id ?? null);
            return { ...item, opcoes, padraoId };
          }
          return item.pratoId === pratoId ? null : item;
        })
        .filter(Boolean);
      return itens.length === (r.itens ?? []).length ? null : { ...r, itens };
    })
    .filter(Boolean);
  if (mudadas.length) await repo.salvarRefeicoes(mudadas);
  await repo.removerPrato(pratoId);
}

/* ------------------------------------------------------------------ */
/* Refeições e itens                                                   */
/* ------------------------------------------------------------------ */

/**
 * Troca a opção padrão de um grupo. A escolha fica salva, como a
 * especificação pede ("a troca altera o padrão salvo").
 * @param {string} refeicaoId
 * @param {string} itemId
 * @param {string} opcaoId
 * @returns {Promise<void>}
 */
export async function escolherOpcao(refeicaoId, itemId, opcaoId) {
  const refeicao = await repo.buscarRefeicao(refeicaoId);
  if (!refeicao) return;
  const itens = refeicao.itens.map((i) =>
    i.id === itemId ? { ...i, padraoId: opcaoId } : i
  );
  await repo.salvarRefeicao({ ...refeicao, itens });
}

/**
 * Muda um item da refeição, seja ele simples ou grupo.
 * @param {string} refeicaoId
 * @param {string} itemId
 * @param {(item: Object) => Object} transformar
 * @returns {Promise<void>}
 */
async function mexerNoItem(refeicaoId, itemId, transformar) {
  const refeicao = await repo.buscarRefeicao(refeicaoId);
  if (!refeicao) return;
  const itens = refeicao.itens.map((i) => (i.id === itemId ? transformar(i) : i));
  await repo.salvarRefeicao({ ...refeicao, itens });
}

/**
 * Acrescenta uma opção a um grupo.
 * @param {string} refeicaoId
 * @param {string} itemId
 * @param {Object} opcao sem id
 * @returns {Promise<void>}
 */
export function adicionarOpcao(refeicaoId, itemId, opcao) {
  return mexerNoItem(refeicaoId, itemId, (item) => ({
    ...item,
    opcoes: [...(item.opcoes ?? []), { id: novoId('op'), ...opcao }],
  }));
}

/**
 * Tira uma opção de um grupo.
 *
 * Tirar a opção padrão promove a primeira que sobrar: um grupo sem padrão
 * não saberia o que somar no total do dia.
 *
 * @param {string} refeicaoId
 * @param {string} itemId
 * @param {string} opcaoId
 * @returns {Promise<void>}
 */
export function removerOpcao(refeicaoId, itemId, opcaoId) {
  return mexerNoItem(refeicaoId, itemId, (item) => {
    const opcoes = (item.opcoes ?? []).filter((o) => o.id !== opcaoId);
    const padraoId = opcoes.some((o) => o.id === item.padraoId)
      ? item.padraoId
      : (opcoes[0]?.id ?? null);
    return { ...item, opcoes, padraoId };
  });
}

/**
 * Altera a quantidade de uma opção de grupo.
 * @param {string} refeicaoId
 * @param {string} itemId
 * @param {string} opcaoId
 * @param {number|null} quantidade
 * @returns {Promise<void>}
 */
export function alterarQuantidadeDaOpcao(refeicaoId, itemId, opcaoId, quantidade) {
  return mexerNoItem(refeicaoId, itemId, (item) => ({
    ...item,
    opcoes: (item.opcoes ?? []).map((o) =>
      o.id !== opcaoId
        ? o
        : { ...o, ...(o.tipo === TIPO_ITEM.PRATO ? { porcoes: quantidade } : { quantidade }) }
    ),
  }));
}

/**
 * Renomeia um grupo de opções.
 * @param {string} refeicaoId
 * @param {string} itemId
 * @param {string} nome
 * @returns {Promise<void>}
 */
export function renomearGrupo(refeicaoId, itemId, nome) {
  return mexerNoItem(refeicaoId, itemId, (item) => ({ ...item, nome: nome.trim() }));
}

/**
 * Busca um item de refeição pelo ID, com a opção escolhida se for grupo.
 * @param {string} refeicaoId
 * @param {string} itemId
 * @param {string} [opcaoId]
 * @returns {Promise<{refeicao: Object, item: Object, opcao: Object|null}|null>}
 */
export async function buscarItem(refeicaoId, itemId, opcaoId) {
  const refeicao = await repo.buscarRefeicao(refeicaoId);
  if (!refeicao) return null;
  const item = (refeicao.itens ?? []).find((i) => i.id === itemId);
  if (!item) return null;
  const opcao = opcaoId ? (item.opcoes ?? []).find((o) => o.id === opcaoId) : null;
  return { refeicao, item, opcao: opcao ?? null };
}

/**
 * Altera a quantidade de um item simples da refeição.
 * @param {string} refeicaoId
 * @param {string} itemId
 * @param {number|null} quantidade
 * @returns {Promise<void>}
 */
export async function alterarQuantidade(refeicaoId, itemId, quantidade) {
  const refeicao = await repo.buscarRefeicao(refeicaoId);
  if (!refeicao) return;
  const itens = refeicao.itens.map((i) =>
    i.id === itemId
      ? { ...i, ...(i.tipo === TIPO_ITEM.PRATO ? { porcoes: quantidade } : { quantidade }) }
      : i
  );
  await repo.salvarRefeicao({ ...refeicao, itens });
}

/**
 * Remove um item de uma refeição.
 * @param {string} refeicaoId
 * @param {string} itemId
 * @returns {Promise<void>}
 */
export async function removerItem(refeicaoId, itemId) {
  const refeicao = await repo.buscarRefeicao(refeicaoId);
  if (!refeicao) return;
  await repo.salvarRefeicao({
    ...refeicao,
    itens: refeicao.itens.filter((i) => i.id !== itemId),
  });
}

/**
 * Acrescenta um item a uma refeição.
 * @param {string} refeicaoId
 * @param {Object} item sem id; o id é gerado aqui
 * @returns {Promise<void>}
 */
export async function adicionarItem(refeicaoId, item) {
  const refeicao = await repo.buscarRefeicao(refeicaoId);
  if (!refeicao) return;
  await repo.salvarRefeicao({
    ...refeicao,
    itens: [...(refeicao.itens ?? []), { id: novoId('it'), ...item }],
  });
}

/**
 * Uma refeição já calculada, para a tela de edição.
 * @param {string} refeicaoId
 * @returns {Promise<Object|null>}
 */
export async function calcularRefeicaoPorId(refeicaoId) {
  const [refeicao, indice] = await Promise.all([repo.buscarRefeicao(refeicaoId), carregarIndice()]);
  if (!refeicao) return null;
  return { refeicao, calculo: calcularRefeicao(refeicao, indice) };
}

/**
 * Em quais planos uma refeição aparece.
 * Serve para avisar que editar o jantar muda os dois dias.
 * @param {string} refeicaoId
 * @returns {Promise<string[]>} nomes dos planos
 */
export async function planosComRefeicao(refeicaoId) {
  const planos = await repo.listarPlanos();
  return planos.filter((p) => (p.refeicoes ?? []).includes(refeicaoId)).map((p) => p.nome);
}

/**
 * Grava as metas de um plano.
 * @param {string} planoId
 * @param {{kcal: number|null, proteina: number|null, gordura: number|null, carbo: number|null}} metas
 * @returns {Promise<void>}
 */
export async function salvarMetas(planoId, metas) {
  const plano = await repo.buscarPlano(planoId);
  if (!plano) return;
  await repo.salvarPlano({
    ...plano,
    metaKcal: metas.kcal,
    metas: {
      proteina: metas.proteina,
      gordura: metas.gordura,
      carbo: metas.carbo,
      fibra: metas.fibra ?? null,
    },
  });
}

export const {
  listarAlimentos,
  listarPratos,
  listarRefeicoes,
  listarPlanos,
  buscarAlimento,
  buscarPrato,
  buscarPlano,
  salvarPrato,
  salvarRefeicao,
} = repo;
