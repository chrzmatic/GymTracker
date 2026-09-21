/**
 * Testes das regras puras de edição de treinos, exercícios e músculos.
 *
 * O que importa aqui: reordenar sem furar a sequência da rotação, e não
 * deixar dado órfão ao excluir um exercício ou um músculo que ainda está
 * em uso.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  moverNoArray,
  moverItemDoTreino,
  moverTreino,
  numerarOrdem,
  alternarRotacao,
  criarItemExercicio,
  virarGrupoDeAlternativas,
  desfazerGrupo,
  removerAlternativa,
  normalizarMusculos,
  usosDoExercicio,
  usosDoMusculo,
  tirarExercicioDosTreinos,
  tirarMusculoDosExercicios,
  seriesPlanejadasDoTreino,
} from '../js/domain/treino.js';

/* ---- reordenação genérica ---- */

test('moverNoArray troca elementos e devolve um array novo', () => {
  const lista = ['a', 'b', 'c'];
  assert.deepEqual(moverNoArray(lista, 2, -1), ['a', 'c', 'b']);
  assert.deepEqual(moverNoArray(lista, 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(lista, ['a', 'b', 'c'], 'o original não muda');
});

test('moverNoArray devolve null nas pontas', () => {
  const lista = ['a', 'b'];
  assert.equal(moverNoArray(lista, 0, -1), null);
  assert.equal(moverNoArray(lista, 1, 1), null);
  assert.equal(moverNoArray(lista, 9, 1), null);
});

/* ---- itens de um treino ---- */

const treinoA = {
  id: 'tr-a',
  nome: 'A',
  naRotacao: true,
  ordem: 0,
  itens: [
    { id: 'it-1', tipo: 'exercicio', exercicioId: 'ex-supino', seriesPlanejadas: 4, opcional: false },
    { id: 'it-2', tipo: 'exercicio', exercicioId: 'ex-remada', seriesPlanejadas: 3, opcional: false },
    { id: 'it-3', tipo: 'exercicio', exercicioId: 'ex-pantu', seriesPlanejadas: 2, opcional: true },
  ],
};

test('moverItemDoTreino reordena os itens', () => {
  const r = moverItemDoTreino(treinoA, 'it-3', -1);
  assert.deepEqual(r.itens.map((i) => i.id), ['it-1', 'it-3', 'it-2']);
  assert.deepEqual(treinoA.itens.map((i) => i.id), ['it-1', 'it-2', 'it-3'], 'original intacto');
});

test('moverItemDoTreino devolve null quando já está na ponta', () => {
  assert.equal(moverItemDoTreino(treinoA, 'it-1', -1), null);
  assert.equal(moverItemDoTreino(treinoA, 'it-3', 1), null);
});

test('seriesPlanejadasDoTreino separa as opcionais', () => {
  assert.deepEqual(seriesPlanejadasDoTreino(treinoA), {
    obrigatorias: 7,
    opcionais: 2,
    total: 9,
  });
});

/* ---- ordem dos treinos ---- */

const treinos = [
  { id: 'tr-a', nome: 'A', naRotacao: true, ordem: 0 },
  { id: 'tr-b', nome: 'B', naRotacao: true, ordem: 1 },
  { id: 'tr-c', nome: 'C', naRotacao: true, ordem: 2 },
  { id: 'tr-x', nome: 'Extra', naRotacao: false, ordem: 3 },
];

test('numerarOrdem põe a rotação antes dos extras e numera do zero', () => {
  const r = numerarOrdem([
    { id: 'x', naRotacao: false },
    { id: 'a', naRotacao: true },
    { id: 'b', naRotacao: true },
  ]);
  assert.deepEqual(r.map((t) => [t.id, t.ordem]), [
    ['a', 0],
    ['b', 1],
    ['x', 2],
  ]);
});

test('moverTreino reordena dentro da rotação', () => {
  const r = moverTreino(treinos, 'tr-c', -1);
  assert.deepEqual(
    r.filter((t) => t.naRotacao).map((t) => t.nome),
    ['A', 'C', 'B']
  );
  assert.deepEqual(r.map((t) => t.ordem), [0, 1, 2, 3], 'ordem sempre sequencial');
});

test('moverTreino não deixa um extra invadir a rotação', () => {
  assert.equal(
    moverTreino(treinos, 'tr-x', -1),
    null,
    'o extra é o único do grupo dele, então não tem para onde ir'
  );
});

test('alternarRotacao manda o treino para o fim do grupo novo', () => {
  const r = alternarRotacao(treinos, 'tr-a');
  const a = r.find((t) => t.id === 'tr-a');
  assert.equal(a.naRotacao, false, 'A saiu da rotação');
  assert.deepEqual(
    r.filter((t) => t.naRotacao).map((t) => t.nome),
    ['B', 'C'],
    'a rotação segue na ordem, sem buraco'
  );
  assert.deepEqual(
    r.filter((t) => !t.naRotacao).map((t) => t.nome),
    ['Extra', 'A'],
    'A entra no fim dos extras'
  );
});

test('alternarRotacao devolve um treino extra para o fim da rotação', () => {
  const r = alternarRotacao(treinos, 'tr-x');
  assert.deepEqual(
    r.filter((t) => t.naRotacao).map((t) => t.nome),
    ['A', 'B', 'C', 'Extra'],
    'entra no fim para não bagunçar a sequência de quem já está rodando'
  );
});

/* ---- grupos de alternativas ---- */

const item = criarItemExercicio({
  id: 'it-1',
  exercicioId: 'ex-voador',
  seriesPlanejadas: 3,
  repsPlanejadas: 12,
  opcional: true,
});

test('virar grupo mantém o exercício original como padrão', () => {
  const grupo = virarGrupoDeAlternativas(item, 'ex-face-pull', 'Voador ou face pull');
  assert.equal(grupo.tipo, 'alternativas');
  assert.deepEqual(grupo.alternativas, ['ex-voador', 'ex-face-pull']);
  assert.equal(grupo.exercicioPadraoId, 'ex-voador');
  assert.equal(grupo.seriesPlanejadas, 3, 'o planejamento é preservado');
  assert.equal(grupo.repsPlanejadas, 12);
  assert.equal(grupo.opcional, true);
  assert.equal(grupo.id, item.id, 'o item mantém o ID');
});

test('desfazer grupo deixa só a alternativa padrão', () => {
  const grupo = virarGrupoDeAlternativas(item, 'ex-face-pull');
  const simples = { ...grupo, exercicioPadraoId: 'ex-face-pull' };
  const r = desfazerGrupo(simples);
  assert.equal(r.tipo, 'exercicio');
  assert.equal(r.exercicioId, 'ex-face-pull');
  assert.equal(r.seriesPlanejadas, 3);
});

test('remover alternativa mantém o grupo enquanto sobrarem duas', () => {
  const grupo = {
    ...virarGrupoDeAlternativas(item, 'ex-face-pull'),
    alternativas: ['ex-voador', 'ex-face-pull', 'ex-crucifixo'],
  };
  const r = removerAlternativa(grupo, 'ex-crucifixo');
  assert.equal(r.tipo, 'alternativas');
  assert.deepEqual(r.alternativas, ['ex-voador', 'ex-face-pull']);
});

test('remover alternativa desfaz o grupo quando sobra uma só', () => {
  const grupo = virarGrupoDeAlternativas(item, 'ex-face-pull');
  const r = removerAlternativa(grupo, 'ex-face-pull');
  assert.equal(r.tipo, 'exercicio');
  assert.equal(r.exercicioId, 'ex-voador');
});

test('remover a alternativa padrão promove outra a padrão', () => {
  const grupo = {
    ...virarGrupoDeAlternativas(item, 'ex-face-pull'),
    alternativas: ['ex-voador', 'ex-face-pull', 'ex-crucifixo'],
  };
  const r = removerAlternativa(grupo, 'ex-voador');
  assert.equal(r.exercicioPadraoId, 'ex-face-pull');
});

/* ---- músculos de um exercício ---- */

test('normalizarMusculos força fração 1 no direto e limita o indireto', () => {
  const r = normalizarMusculos([
    { musculoId: 'mus-peito', tipo: 'direto', fracao: 0.3 },
    { musculoId: 'mus-triceps', tipo: 'indireto', fracao: 0.5 },
    { musculoId: 'mus-ombro', tipo: 'indireto', fracao: 9 },
    { musculoId: 'mus-costas', tipo: 'indireto', fracao: -2 },
  ]);
  assert.deepEqual(r, [
    { musculoId: 'mus-peito', tipo: 'direto', fracao: 1 },
    { musculoId: 'mus-triceps', tipo: 'indireto', fracao: 0.5 },
    { musculoId: 'mus-ombro', tipo: 'indireto', fracao: 1 },
    { musculoId: 'mus-costas', tipo: 'indireto', fracao: 0 },
  ]);
});

test('normalizarMusculos não deixa o mesmo músculo duas vezes', () => {
  const r = normalizarMusculos([
    { musculoId: 'mus-peito', tipo: 'direto' },
    { musculoId: 'mus-peito', tipo: 'indireto', fracao: 0.5 },
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].tipo, 'direto');
});

/* ---- exclusão sem deixar órfão ---- */

const comGrupo = {
  id: 'tr-b',
  nome: 'B',
  naRotacao: true,
  itens: [
    { id: 'it-1', tipo: 'exercicio', exercicioId: 'ex-supino', seriesPlanejadas: 3 },
    {
      id: 'it-2',
      tipo: 'alternativas',
      alternativas: ['ex-voador', 'ex-face-pull'],
      exercicioPadraoId: 'ex-voador',
      seriesPlanejadas: 3,
    },
  ],
};

test('usosDoExercicio acha tanto item simples quanto alternativa', () => {
  assert.deepEqual(usosDoExercicio([treinoA, comGrupo], 'ex-supino'), [
    { treinoId: 'tr-a', treinoNome: 'A', comoAlternativa: false },
    { treinoId: 'tr-b', treinoNome: 'B', comoAlternativa: false },
  ]);
  assert.deepEqual(usosDoExercicio([treinoA, comGrupo], 'ex-face-pull'), [
    { treinoId: 'tr-b', treinoNome: 'B', comoAlternativa: true },
  ]);
  assert.deepEqual(usosDoExercicio([treinoA], 'ex-nao-usado'), []);
});

test('excluir um exercício tira o item simples e só a alternativa do grupo', () => {
  const r = tirarExercicioDosTreinos([treinoA, comGrupo], 'ex-supino');
  assert.equal(r.length, 2, 'os dois treinos mudaram');

  const a = r.find((t) => t.id === 'tr-a');
  assert.deepEqual(a.itens.map((i) => i.id), ['it-2', 'it-3'], 'o item saiu do A');

  const b = r.find((t) => t.id === 'tr-b');
  assert.deepEqual(b.itens.map((i) => i.id), ['it-2'], 'no B sobrou só o grupo');
});

test('excluir uma alternativa desfaz o grupo em vez de apagar o item', () => {
  const r = tirarExercicioDosTreinos([comGrupo], 'ex-face-pull');
  const grupo = r[0].itens.find((i) => i.id === 'it-2');
  assert.equal(grupo.tipo, 'exercicio');
  assert.equal(grupo.exercicioId, 'ex-voador', 'a alternativa que sobrou vira o item');
});

test('treino sem o exercício não entra na lista de alterados', () => {
  assert.deepEqual(tirarExercicioDosTreinos([treinoA], 'ex-inexistente'), []);
});

/* ---- músculos em uso ---- */

const exercicios = [
  {
    id: 'ex-supino',
    nome: 'Supino',
    musculos: [
      { musculoId: 'mus-peito', tipo: 'direto', fracao: 1 },
      { musculoId: 'mus-triceps', tipo: 'indireto', fracao: 0.5 },
    ],
  },
  { id: 'ex-rosca', nome: 'Rosca', musculos: [{ musculoId: 'mus-biceps', tipo: 'direto', fracao: 1 }] },
];

test('usosDoMusculo lista os exercícios que citam o músculo', () => {
  assert.deepEqual(
    usosDoMusculo(exercicios, 'mus-triceps').map((e) => e.id),
    ['ex-supino']
  );
  assert.deepEqual(usosDoMusculo(exercicios, 'mus-panturrilha'), []);
});

test('excluir um músculo o remove só dos exercícios que o usam', () => {
  const r = tirarMusculoDosExercicios(exercicios, 'mus-triceps');
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].musculos.map((m) => m.musculoId), ['mus-peito']);
  assert.equal(
    exercicios[0].musculos.length,
    2,
    'o exercício original não é alterado no lugar'
  );
});
