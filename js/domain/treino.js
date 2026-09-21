/**
 * Regras puras dos modelos de treino, exercícios e músculos.
 *
 * Nada aqui toca IndexedDB nem a página. São as operações de edição
 * (criar, reordenar, transformar em grupo de alternativas) e as checagens
 * de uso que impedem apagar algo que ainda está em uso.
 *
 * Diferença de ordenação entre treinos e itens, que é fácil confundir:
 *  - **treinos** têm campo `ordem`, porque a rotação precisa de uma sequência
 *    explícita que sobrevive a gravações separadas;
 *  - **itens de um treino** são ordenados pela posição no array `itens`,
 *    porque eles são gravados sempre juntos, dentro do treino.
 */

import { TIPOS_CARGA } from '../utils/constantes.js';

/* ------------------------------------------------------------------ */
/* Reordenação                                                         */
/* ------------------------------------------------------------------ */

/**
 * Move um elemento do array uma posição para cima ou para baixo.
 * @param {Array} lista
 * @param {number} indice posição atual
 * @param {-1|1} direcao -1 sobe, 1 desce
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
 * Move um item dentro de um treino.
 * @param {Object} treino
 * @param {string} itemId
 * @param {-1|1} direcao
 * @returns {Object|null} treino atualizado, ou null se não deu para mover
 */
export function moverItemDoTreino(treino, itemId, direcao) {
  const indice = treino.itens.findIndex((i) => i.id === itemId);
  const itens = moverNoArray(treino.itens, indice, direcao);
  return itens ? { ...treino, itens } : null;
}

/**
 * Move um treino dentro do próprio grupo (rotação ou extras).
 *
 * Reordenar só faz sentido dentro do grupo: a rotação tem sequência, os
 * extras são uma lista solta. Depois da troca, o campo `ordem` de *todos*
 * os treinos é recalculado, com a rotação primeiro.
 *
 * @param {Object[]} treinos todos os treinos
 * @param {string} treinoId
 * @param {-1|1} direcao
 * @returns {Object[]|null} lista completa com `ordem` nova, ou null
 */
export function moverTreino(treinos, treinoId, direcao) {
  const alvo = treinos.find((t) => t.id === treinoId);
  if (!alvo) return null;

  const mesmoGrupo = (t) => Boolean(t.naRotacao) === Boolean(alvo.naRotacao);
  const grupo = treinos.filter(mesmoGrupo).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const movido = moverNoArray(grupo, grupo.indexOf(alvo), direcao);
  if (!movido) return null;

  const outros = treinos.filter((t) => !mesmoGrupo(t));
  return numerarOrdem(alvo.naRotacao ? [...movido, ...outros] : [...outros, ...movido]);
}

/**
 * Recalcula o campo `ordem` com a rotação sempre antes dos extras.
 * @param {Object[]} treinos na ordem desejada dentro de cada grupo
 * @returns {Object[]}
 */
export function numerarOrdem(treinos) {
  const rotacao = treinos.filter((t) => t.naRotacao);
  const extras = treinos.filter((t) => !t.naRotacao);
  return [...rotacao, ...extras].map((t, ordem) => ({ ...t, ordem }));
}

/**
 * Troca um treino entre rotação e extras.
 *
 * Ao entrar na rotação o treino vai para o fim dela, que é o lugar que não
 * bagunça a sequência de quem já está rodando.
 *
 * @param {Object[]} treinos
 * @param {string} treinoId
 * @returns {Object[]} lista completa com `ordem` nova
 */
export function alternarRotacao(treinos, treinoId) {
  const trocado = treinos.map((t) =>
    t.id === treinoId ? { ...t, naRotacao: !t.naRotacao } : t
  );
  const ordenado = trocado.slice().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const alvo = ordenado.find((t) => t.id === treinoId);
  const resto = ordenado.filter((t) => t.id !== treinoId);
  return numerarOrdem([...resto, alvo]);
}

/* ------------------------------------------------------------------ */
/* Criação de itens                                                    */
/* ------------------------------------------------------------------ */

/**
 * Cria um item de exercício para um modelo de treino.
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.exercicioId
 * @param {number} [params.seriesPlanejadas]
 * @param {number|null} [params.repsPlanejadas]
 * @param {boolean} [params.opcional]
 * @returns {Object}
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
 * Transforma um item de exercício num grupo de alternativas.
 *
 * O exercício que já estava no item vira a primeira alternativa e o padrão,
 * então nenhuma sessão antiga fica órfã e a próxima sessão começa igual.
 *
 * @param {Object} item item do tipo 'exercicio'
 * @param {string} outroExercicioId a segunda alternativa
 * @param {string} [nome] rótulo do grupo (ex.: 'Voador inverso ou face pull')
 * @returns {Object} item do tipo 'alternativas'
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

/**
 * Desfaz um grupo de alternativas, mantendo só a alternativa padrão.
 * @param {Object} item item do tipo 'alternativas'
 * @returns {Object} item do tipo 'exercicio'
 */
export function desfazerGrupo(item) {
  return criarItemExercicio({
    id: item.id,
    exercicioId: item.exercicioPadraoId ?? item.alternativas[0],
    seriesPlanejadas: item.seriesPlanejadas,
    repsPlanejadas: item.repsPlanejadas,
    opcional: item.opcional,
  });
}

/**
 * Remove uma alternativa de um grupo.
 * Sobrando uma só, o grupo deixa de fazer sentido e vira item simples.
 * @param {Object} item
 * @param {string} exercicioId alternativa a remover
 * @returns {Object} o grupo sem ela, ou um item de exercício
 */
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

/* ------------------------------------------------------------------ */
/* Exercícios e músculos                                               */
/* ------------------------------------------------------------------ */

/**
 * Cria um exercício novo.
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.nome
 * @param {string} [params.tipoCarga]
 * @param {Object[]} [params.musculos]
 * @returns {Object}
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
 * Normaliza a lista de músculos de um exercício.
 *
 * Regras: músculo direto sempre conta 1 (a fração não se aplica); indireto
 * usa a fração informada, limitada entre 0 e 1. Um músculo não pode aparecer
 * duas vezes no mesmo exercício.
 *
 * @param {{musculoId: string, tipo: string, fracao?: number}[]} lista
 * @returns {Object[]}
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
 * Onde um exercício está sendo usado nos modelos de treino.
 *
 * Usado para avisar antes de excluir: a especificação pede confirmação antes
 * de apagar qualquer coisa, e apagar um exercício em uso deixaria itens
 * apontando para o vazio.
 *
 * @param {Object[]} treinos
 * @param {string} exercicioId
 * @returns {{treinoId: string, treinoNome: string, comoAlternativa: boolean}[]}
 */
export function usosDoExercicio(treinos, exercicioId) {
  const usos = [];
  treinos.forEach((treino) => {
    treino.itens.forEach((item) => {
      if (item.tipo === 'alternativas') {
        if ((item.alternativas ?? []).includes(exercicioId)) {
          usos.push({ treinoId: treino.id, treinoNome: treino.nome, comoAlternativa: true });
        }
      } else if (item.exercicioId === exercicioId) {
        usos.push({ treinoId: treino.id, treinoNome: treino.nome, comoAlternativa: false });
      }
    });
  });
  return usos;
}

/**
 * Quais exercícios usam um músculo.
 * @param {Object[]} exercicios
 * @param {string} musculoId
 * @returns {Object[]} os exercícios que citam esse músculo
 */
export function usosDoMusculo(exercicios, musculoId) {
  return exercicios.filter((e) =>
    (e.musculos ?? []).some((m) => m.musculoId === musculoId)
  );
}

/**
 * Remove um músculo de todos os exercícios que o citam.
 * @param {Object[]} exercicios
 * @param {string} musculoId
 * @returns {Object[]} só os exercícios que precisaram mudar
 */
export function tirarMusculoDosExercicios(exercicios, musculoId) {
  return usosDoMusculo(exercicios, musculoId).map((e) => ({
    ...e,
    musculos: e.musculos.filter((m) => m.musculoId !== musculoId),
  }));
}

/**
 * Remove um exercício de todos os treinos que o usam.
 *
 * Num grupo de alternativas, tira só aquela alternativa (e o grupo vira item
 * simples se sobrar uma só). Num item simples, o item inteiro sai.
 *
 * @param {Object[]} treinos
 * @param {string} exercicioId
 * @returns {Object[]} só os treinos que precisaram mudar
 */
export function tirarExercicioDosTreinos(treinos, exercicioId) {
  const mudados = [];
  treinos.forEach((treino) => {
    let mudou = false;
    const itens = [];
    treino.itens.forEach((item) => {
      if (item.tipo === 'alternativas' && (item.alternativas ?? []).includes(exercicioId)) {
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
 * Soma as séries planejadas de um treino, separando as opcionais.
 * @param {Object} treino
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
