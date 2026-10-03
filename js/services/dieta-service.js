/** Dieta: índice, pratos, refeições, planos e o dia calculado. */

import * as repo from '../data/dieta-repo.js';
import { listarSessoesDaData } from '../data/sessoes-repo.js';
import { novoId, paraSlug } from '../utils/id.js';
import { hojeIso } from '../utils/date.js';
import {
  calcularPlano,
  calcularPrato,
  calcularRefeicao,
  TIPO_ITEM,
  tirarDasRefeicoes,
} from '../domain/nutricao.js';

/**
 * Alimentos e pratos por ID, para os cálculos.
 * @returns {Promise<{alimentos: Map, pratos: Map}>}
 */
export async function carregarIndice() {
  const [alimentos, pratos] = await Promise.all([
    repo.mapaAlimentos(),
    repo.mapaPratos(),
  ]);
  return { alimentos, pratos };
}

/* --- O dia --- */

/**
 * Plano de uma data.
 * Uma escolha manual vale primeiro; senão, dia de treino se há sessão
 * naquele dia, ou dia sem treino.
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

/** O dia calculado: refeições, totais e metas. */
export async function calcularDia(planoId) {
  const [plano, refeicoes, indice] = await Promise.all([
    repo.buscarPlano(planoId),
    repo.listarRefeicoes(),
    carregarIndice(),
  ]);
  if (!plano) return null;

  const porId = new Map(refeicoes.map((r) => [r.id, r]));

  // A ordem vem da lista do plano: a mesma refeição pode ter posições
  // diferentes em cada plano.
  const doPlano = (plano.refeicoes ?? [])
    .map((id, i) => {
      const refeicao = porId.get(id);
      return refeicao ? { ...refeicao, ordem: i } : null;
    })
    .filter(Boolean);

  return calcularPlano(plano, doPlano, indice);
}

/* --- Refeições de um plano --- */

/** Cria uma refeição no fim do plano. */
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
  await repo.salvarPlano({
    ...plano,
    refeicoes: [...(plano.refeicoes ?? []), refeicao.id],
  });
  return refeicao;
}

/** Põe uma refeição existente no plano (ela passa a ser compartilhada). */
export async function adicionarRefeicaoAoPlano(planoId, refeicaoId) {
  const plano = await repo.buscarPlano(planoId);
  if (!plano || (plano.refeicoes ?? []).includes(refeicaoId)) return;
  await repo.salvarPlano({
    ...plano,
    refeicoes: [...(plano.refeicoes ?? []), refeicaoId],
  });
}

/**
 * Tira a refeição do plano. Se não estiver em outro plano, apaga.
 * @returns {Promise<{apagada: boolean}>}
 */
export async function removerRefeicaoDoPlano(planoId, refeicaoId) {
  const [plano, planos] = await Promise.all([
    repo.buscarPlano(planoId),
    repo.listarPlanos(),
  ]);
  if (!plano) return { apagada: false };

  await repo.salvarPlano({
    ...plano,
    refeicoes: (plano.refeicoes ?? []).filter((id) => id !== refeicaoId),
  });

  const aindaUsada = planos.some(
    (p) => p.id !== planoId && (p.refeicoes ?? []).includes(refeicaoId),
  );
  if (!aindaUsada) {
    await repo.removerRefeicao(refeicaoId);
    return { apagada: true };
  }
  return { apagada: false };
}

/**
 * Sobe (-1) ou desce (1) a refeição no plano.
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

/** Renomeia a refeição (vale em todos os planos que a usam). */
export async function renomearRefeicao(refeicaoId, nome) {
  const refeicao = await repo.buscarRefeicao(refeicaoId);
  if (!refeicao) return;
  await repo.salvarRefeicao({ ...refeicao, nome: nome.trim() });
}

/** Refeições que não estão neste plano. */
export async function refeicoesForaDoPlano(planoId) {
  const [plano, refeicoes] = await Promise.all([
    repo.buscarPlano(planoId),
    repo.listarRefeicoes(),
  ]);
  const dentro = new Set(plano?.refeicoes ?? []);
  return refeicoes.filter((r) => !dentro.has(r.id));
}

export async function renomearPlano(planoId, nome) {
  const plano = await repo.buscarPlano(planoId);
  if (!plano) return;
  await repo.salvarPlano({ ...plano, nome: nome.trim() });
}

/** Fixa o plano de uma data. */
export function escolherPlanoDoDia(data, planoId) {
  return repo.salvarTipoDia(data, planoId);
}

/** Volta a escolher o plano automaticamente na data. */
export function voltarAoAutomatico(data) {
  return repo.removerTipoDia(data);
}

/* --- Alimentos --- */

/** Cria um alimento. O ID vem do nome. */
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

/** Grava um alimento editado e tira a marca "conferir". */
export async function salvarAlimento(alimento) {
  const limpo = { ...alimento, nome: alimento.nome.trim(), conferir: false };
  await repo.salvarAlimento(limpo);
  return limpo;
}

/**
 * Pratos e refeições que usam o alimento (para avisar antes de excluir).
 * @returns {Promise<{pratos: string[], refeicoes: string[]}>}
 */
export async function ondeAlimentoEUsado(alimentoId) {
  const [pratos, refeicoes] = await Promise.all([
    repo.listarPratos(),
    repo.listarRefeicoes(),
  ]);

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

/** Exclui o alimento e tira dos pratos e refeições. */
export async function excluirAlimento(alimentoId) {
  const [pratos, refeicoes] = await Promise.all([
    repo.listarPratos(),
    repo.listarRefeicoes(),
  ]);

  const pratosMudados = pratos
    .filter((p) => (p.ingredientes ?? []).some((i) => i.alimentoId === alimentoId))
    .map((p) => ({
      ...p,
      ingredientes: p.ingredientes.filter((i) => i.alimentoId !== alimentoId),
    }));
  if (pratosMudados.length) await repo.salvarPratos(pratosMudados);

  const refeicoesMudadas = tirarDasRefeicoes(
    refeicoes,
    (x) => x.alimentoId === alimentoId,
  );
  if (refeicoesMudadas.length) await repo.salvarRefeicoes(refeicoesMudadas);

  await repo.removerAlimento(alimentoId);
}

/* --- Pratos compostos --- */

/** Cria um prato vazio. */
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

/** Prato com os valores calculados. */
export async function calcularPratoPorId(pratoId) {
  const [prato, indice] = await Promise.all([
    repo.buscarPrato(pratoId),
    carregarIndice(),
  ]);
  if (!prato) return null;
  return { prato, ...calcularPrato(prato, indice.alimentos) };
}

/** Nomes das refeições que usam o prato. */
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

/** Exclui o prato e tira das refeições. */
export async function excluirPrato(pratoId) {
  const refeicoes = await repo.listarRefeicoes();
  const mudadas = tirarDasRefeicoes(refeicoes, (x) => x.pratoId === pratoId);
  if (mudadas.length) await repo.salvarRefeicoes(mudadas);
  await repo.removerPrato(pratoId);
}

/* --- Refeições e itens --- */

/** Troca a opção padrão de um grupo (fica salva). */
export async function escolherOpcao(refeicaoId, itemId, opcaoId) {
  const refeicao = await repo.buscarRefeicao(refeicaoId);
  if (!refeicao) return;
  const itens = refeicao.itens.map((i) =>
    i.id === itemId ? { ...i, padraoId: opcaoId } : i
  );
  await repo.salvarRefeicao({ ...refeicao, itens });
}

/**
 * Aplica `transformar` a um item da refeição.
 * @param {(item: Object) => Object} transformar
 */
async function mexerNoItem(refeicaoId, itemId, transformar) {
  const refeicao = await repo.buscarRefeicao(refeicaoId);
  if (!refeicao) return;
  const itens = refeicao.itens.map((i) => (i.id === itemId ? transformar(i) : i));
  await repo.salvarRefeicao({ ...refeicao, itens });
}

/** Acrescenta uma opção ao grupo (o id é gerado aqui). */
export function adicionarOpcao(refeicaoId, itemId, opcao) {
  return mexerNoItem(refeicaoId, itemId, (item) => ({
    ...item,
    opcoes: [...(item.opcoes ?? []), { id: novoId('op'), ...opcao }],
  }));
}

/** Tira uma opção do grupo. Se era a padrão, a primeira que sobrar vira padrão. */
export function removerOpcao(refeicaoId, itemId, opcaoId) {
  return mexerNoItem(refeicaoId, itemId, (item) => {
    const opcoes = (item.opcoes ?? []).filter((o) => o.id !== opcaoId);
    const padraoId = opcoes.some((o) => o.id === item.padraoId)
      ? item.padraoId
      : (opcoes[0]?.id ?? null);
    return { ...item, opcoes, padraoId };
  });
}

/** Muda a quantidade (ou porções) de uma opção. */
export function alterarQuantidadeDaOpcao(refeicaoId, itemId, opcaoId, quantidade) {
  return mexerNoItem(refeicaoId, itemId, (item) => ({
    ...item,
    opcoes: (item.opcoes ?? []).map((o) =>
      o.id !== opcaoId ? o : {
        ...o,
        ...(o.tipo === TIPO_ITEM.PRATO ? { porcoes: quantidade } : { quantidade }),
      }
    ),
  }));
}

export function renomearGrupo(refeicaoId, itemId, nome) {
  return mexerNoItem(refeicaoId, itemId, (item) => ({ ...item, nome: nome.trim() }));
}

/**
 * Item da refeição, com a opção se houver.
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

/** Muda a quantidade (ou porções) de um item simples. */
export async function alterarQuantidade(refeicaoId, itemId, quantidade) {
  const refeicao = await repo.buscarRefeicao(refeicaoId);
  if (!refeicao) return;
  const itens = refeicao.itens.map((i) =>
    i.id === itemId
      ? {
        ...i,
        ...(i.tipo === TIPO_ITEM.PRATO ? { porcoes: quantidade } : { quantidade }),
      }
      : i
  );
  await repo.salvarRefeicao({ ...refeicao, itens });
}

export async function removerItem(refeicaoId, itemId) {
  const refeicao = await repo.buscarRefeicao(refeicaoId);
  if (!refeicao) return;
  await repo.salvarRefeicao({
    ...refeicao,
    itens: refeicao.itens.filter((i) => i.id !== itemId),
  });
}

/** Acrescenta um item (o id é gerado aqui). */
export async function adicionarItem(refeicaoId, item) {
  const refeicao = await repo.buscarRefeicao(refeicaoId);
  if (!refeicao) return;
  await repo.salvarRefeicao({
    ...refeicao,
    itens: [...(refeicao.itens ?? []), { id: novoId('it'), ...item }],
  });
}

/** Refeição com os valores calculados. */
export async function calcularRefeicaoPorId(refeicaoId) {
  const [refeicao, indice] = await Promise.all([
    repo.buscarRefeicao(refeicaoId),
    carregarIndice(),
  ]);
  if (!refeicao) return null;
  return { refeicao, calculo: calcularRefeicao(refeicao, indice) };
}

/** Nomes dos planos que usam a refeição. */
export async function planosComRefeicao(refeicaoId) {
  const planos = await repo.listarPlanos();
  return planos.filter((p) => (p.refeicoes ?? []).includes(refeicaoId)).map((p) =>
    p.nome
  );
}

/**
 * Grava as metas do plano.
 * @param {string} planoId
 * @param {{kcal: number|null, proteina: number|null, gordura: number|null, carbo: number|null}} metas
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
