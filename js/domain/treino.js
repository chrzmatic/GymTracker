/**
 * Regras puras de treinos, exercícios e músculos.
 *
 * Treinos têm campo `ordem` (a rotação precisa de sequência);
 * os itens de um treino seguem a posição no array `itens`.
 */

import { TIPOS_CARGA } from '../utils/constantes.js';

/* --- Reordenação --- */

/**
 * Move um elemento uma posição.
 * @returns {Array|null} novo array, ou null se já está na ponta
 */
export function moverNoArray(lista, indice, direcao) {
  const destino = indice + direcao;
  if (indice < 0 || indice >= lista.length) return null;
  if (destino < 0 || destino >= lista.length) return null;
  const copia = lista.slice();
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  return copia;
}

/**
 * Move um item dentro do treino.
 * @returns {Object|null} treino atualizado, ou null
 */
export function moverItemDoTreino(treino, itemId, direcao) {
  const indice = treino.itens.findIndex((i) => i.id === itemId);
  const itens = moverNoArray(treino.itens, indice, direcao);
  return itens ? { ...treino, itens } : null;
}

/**
 * Move um treino dentro do grupo (rotação ou extras) e recalcula `ordem`.
 * @returns {Object[]|null} todos os treinos, ou null
 */
export function moverTreino(treinos, treinoId, direcao) {
  const alvo = treinos.find((t) => t.id === treinoId);
  if (!alvo) return null;

  const mesmoGrupo = (t) => Boolean(t.naRotacao) === Boolean(alvo.naRotacao);
  const grupo = treinos.filter(mesmoGrupo).sort((a, b) =>
    (a.ordem ?? 0) - (b.ordem ?? 0)
  );
  const movido = moverNoArray(grupo, grupo.indexOf(alvo), direcao);
  if (!movido) return null;

  const outros = treinos.filter((t) => !mesmoGrupo(t));
  return numerarOrdem(alvo.naRotacao ? [...movido, ...outros] : [...outros, ...movido]);
}

/** Recalcula `ordem`, com a rotação antes dos extras. */
export function numerarOrdem(treinos) {
  const rotacao = treinos.filter((t) => t.naRotacao);
  const extras = treinos.filter((t) => !t.naRotacao);
  return [...rotacao, ...extras].map((t, ordem) => ({ ...t, ordem }));
}

/** Troca um treino entre rotação e extras. Ao entrar na rotação, vai para o fim. */
export function alternarRotacao(treinos, treinoId) {
  const trocado = treinos.map((t) =>
    t.id === treinoId ? { ...t, naRotacao: !t.naRotacao } : t
  );
  const ordenado = trocado.slice().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const alvo = ordenado.find((t) => t.id === treinoId);
  const resto = ordenado.filter((t) => t.id !== treinoId);
  return numerarOrdem([...resto, alvo]);
}

/* --- Criação de itens --- */

/**
 * Item de exercício para um treino.
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.exercicioId
 * @param {number} [params.seriesPlanejadas]
 * @param {number|null} [params.repsPlanejadas]
 * @param {boolean} [params.opcional]
 */
export function criarItemExercicio({
  id,
  exercicioId,
  seriesPlanejadas = 3,
  repsPlanejadas = null,
  opcional = false,
}) {
  return {
    id,
    tipo: 'exercicio',
    exercicioId,
    seriesPlanejadas,
    repsPlanejadas,
    opcional,
  };
}

/**
 * Transforma um item em grupo de alternativas. O exercício atual vira o padrão.
 * @param {Object} item do tipo 'exercicio'
 * @param {string} outroExercicioId
 * @param {string} [nome] ex.: 'Voador inverso ou face pull'
 */
export function virarGrupoDeAlternativas(item, outroExercicioId, nome = null) {
  return {
    id: item.id,
    tipo: 'alternativas',
    nome,
    alternativas: [item.exercicioId, outroExercicioId],
    exercicioPadraoId: item.exercicioId,
    seriesPlanejadas: item.seriesPlanejadas,
    repsPlanejadas: item.repsPlanejadas,
    opcional: item.opcional,
  };
}

/** Desfaz o grupo, ficando só a alternativa padrão. */
export function desfazerGrupo(item) {
  return criarItemExercicio({
    id: item.id,
    exercicioId: item.exercicioPadraoId ?? item.alternativas[0],
    seriesPlanejadas: item.seriesPlanejadas,
    repsPlanejadas: item.repsPlanejadas,
    opcional: item.opcional,
  });
}

/** Tira uma alternativa. Sobrando uma, vira item simples. */
export function removerAlternativa(item, exercicioId) {
  const alternativas = item.alternativas.filter((id) => id !== exercicioId);
  if (alternativas.length <= 1) {
    return criarItemExercicio({
      id: item.id,
      exercicioId: alternativas[0] ?? item.exercicioPadraoId,
      seriesPlanejadas: item.seriesPlanejadas,
      repsPlanejadas: item.repsPlanejadas,
      opcional: item.opcional,
    });
  }
  const exercicioPadraoId = alternativas.includes(item.exercicioPadraoId)
    ? item.exercicioPadraoId
    : alternativas[0];
  return { ...item, alternativas, exercicioPadraoId };
}

/* --- Exercícios e músculos --- */

/**
 * Exercício novo.
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.nome
 * @param {string} [params.tipoCarga]
 * @param {Object[]} [params.musculos]
 */
export function criarExercicio({
  id,
  nome,
  tipoCarga = TIPOS_CARGA.CARGA,
  musculos = [],
}) {
  return { id, nome: nome.trim(), tipoCarga, musculos };
}

/**
 * Limpa a lista de músculos: direto vale 1, indireto usa a fração (0 a 1),
 * sem repetir músculo.
 * @param {{musculoId: string, tipo: string, fracao?: number}[]} lista
 */
export function normalizarMusculos(lista) {
  const vistos = new Set();
  const saida = [];
  lista.forEach((m) => {
    if (!m.musculoId || vistos.has(m.musculoId)) return;
    vistos.add(m.musculoId);
    if (m.tipo === 'direto') {
      saida.push({ musculoId: m.musculoId, tipo: 'direto', fracao: 1 });
    } else {
      const fracao = Math.min(1, Math.max(0, Number(m.fracao ?? 0.5)));
      saida.push({ musculoId: m.musculoId, tipo: 'indireto', fracao });
    }
  });
  return saida;
}

/**
 * Treinos que usam um exercício (para avisar antes de excluir).
 * @returns {{treinoId: string, treinoNome: string, comoAlternativa: boolean}[]}
 */
export function usosDoExercicio(treinos, exercicioId) {
  const usos = [];
  treinos.forEach((treino) => {
    treino.itens.forEach((item) => {
      if (item.tipo === 'alternativas') {
        if ((item.alternativas ?? []).includes(exercicioId)) {
          usos.push({
            treinoId: treino.id,
            treinoNome: treino.nome,
            comoAlternativa: true,
          });
        }
      } else if (item.exercicioId === exercicioId) {
        usos.push({
          treinoId: treino.id,
          treinoNome: treino.nome,
          comoAlternativa: false,
        });
      }
    });
  });
  return usos;
}

/** Exercícios que usam um músculo. */
export function usosDoMusculo(exercicios, musculoId) {
  return exercicios.filter((e) =>
    (e.musculos ?? []).some((m) => m.musculoId === musculoId)
  );
}

/** Tira um músculo dos exercícios. Devolve só os que mudaram. */
export function tirarMusculoDosExercicios(exercicios, musculoId) {
  return usosDoMusculo(exercicios, musculoId).map((e) => ({
    ...e,
    musculos: e.musculos.filter((m) => m.musculoId !== musculoId),
  }));
}

/**
 * Tira um exercício dos treinos. Num grupo, tira só a alternativa.
 * Devolve só os treinos que mudaram.
 */
export function tirarExercicioDosTreinos(treinos, exercicioId) {
  const mudados = [];
  treinos.forEach((treino) => {
    let mudou = false;
    const itens = [];
    treino.itens.forEach((item) => {
      if (
        item.tipo === 'alternativas' && (item.alternativas ?? []).includes(exercicioId)
      ) {
        mudou = true;
        const restante = removerAlternativa(item, exercicioId);
        if (restante.exercicioId !== exercicioId) itens.push(restante);
        return;
      }
      if (item.tipo !== 'alternativas' && item.exercicioId === exercicioId) {
        mudou = true;
        return;
      }
      itens.push(item);
    });
    if (mudou) mudados.push({ ...treino, itens });
  });
  return mudados;
}

/**
 * Séries planejadas do treino.
 * @returns {{obrigatorias: number, opcionais: number, total: number}}
 */
export function seriesPlanejadasDoTreino(treino) {
  let obrigatorias = 0;
  let opcionais = 0;
  (treino.itens ?? []).forEach((item) => {
    const n = item.seriesPlanejadas ?? 0;
    if (item.opcional) opcionais += n;
    else obrigatorias += n;
  });
  return { obrigatorias, opcionais, total: obrigatorias + opcionais };
}
