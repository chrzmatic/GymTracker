/**
 * Testes da sugestão do próximo treino (especificação, seção 6.4).
 *
 * A primeira parte reproduz literalmente os quatro exemplos da
 * especificação. O resto cobre o que os exemplos não dizem: rotação de
 * outro tamanho, treino tirado da rotação, empate no mesmo dia e a
 * fronteira exata das duas condições de reinício.
 *
 * Calendário usado nos testes (2025):
 *   set  1 seg   2 ter   3 qua   4 qui   5 sex   6 sáb   7 dom
 *   set  8 seg   9 ter  10 qua  11 qui  12 sex  13 sáb  14 dom
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sugerirTreino,
  ultimaSessaoDaRotacao,
  deveReiniciar,
  explicarSugestao,
  diaDaProximaSugestao,
  MOTIVO,
} from '../js/domain/rotacao.js';

/** Semana começando na segunda, X = 2 dias: o padrão da especificação. */
const PADRAO = { inicioSemana: 1, diasParaReiniciarRotacao: 2 };

const A = { id: 'tr-a', nome: 'A', naRotacao: true };
const B = { id: 'tr-b', nome: 'B', naRotacao: true };
const C = { id: 'tr-c', nome: 'C', naRotacao: true };
const ROTACAO = [A, B, C];

let contador = 0;

/**
 * Monta uma sessão de teste.
 * @param {Object} treino
 * @param {string} data AAAA-MM-DD
 * @returns {Object}
 */
function sessao(treino, data) {
  contador += 1;
  return {
    id: `ses-${contador}`,
    data,
    treinoId: treino.id,
    treinoNome: treino.nome,
    naRotacao: Boolean(treino.naRotacao),
    criadaEm: contador,
  };
}

/** Só o nome do treino sugerido, que é o que os exemplos afirmam. */
function sugerido(sessoes, dia, rotacao = ROTACAO, config = PADRAO) {
  const r = sugerirTreino(sessoes, rotacao, dia, config);
  return r ? r.treino.nome : null;
}

/* ------------------------------------------------------------------ */
/* Os quatro exemplos da especificação                                 */
/* ------------------------------------------------------------------ */

test('exemplo 1: fez A e B, pulou o C — na segunda seguinte sugere A', () => {
  const sessoes = [sessao(A, '2025-09-01'), sessao(B, '2025-09-03')];
  assert.equal(sugerido(sessoes, '2025-09-08'), 'A');
});

test('exemplo 2: fez B no domingo — na segunda sugere C (semana nova, mas só 1 dia)', () => {
  const sessoes = [sessao(B, '2025-09-07')];
  assert.equal(sugerido(sessoes, '2025-09-08'), 'C');
});

test('exemplo 3: fez A, B e C — na semana seguinte sugere A', () => {
  const sessoes = [
    sessao(A, '2025-09-01'),
    sessao(B, '2025-09-03'),
    sessao(C, '2025-09-05'),
  ];
  assert.equal(sugerido(sessoes, '2025-09-08'), 'A');
});

test('exemplo 4: fez A, depois um treino extra — o próximo sugerido é B', () => {
  const extra = { id: 'tr-extra', nome: 'Cardio', naRotacao: false };
  const sessoes = [sessao(A, '2025-09-01'), sessao(extra, '2025-09-02')];
  assert.equal(sugerido(sessoes, '2025-09-03'), 'B', 'o extra não avança a rotação');
});

/* ------------------------------------------------------------------ */
/* Sem histórico e rotação vazia                                       */
/* ------------------------------------------------------------------ */

test('sem nenhuma sessão, sugere o primeiro da rotação', () => {
  const r = sugerirTreino([], ROTACAO, '2025-09-08', PADRAO);
  assert.equal(r.treino.nome, 'A');
  assert.equal(r.motivo, MOTIVO.PRIMEIRO);
  assert.equal(r.ultima, null);
});

test('rotação vazia não sugere nada', () => {
  assert.equal(sugerirTreino([sessao(A, '2025-09-01')], [], '2025-09-08', PADRAO), null);
});

test('só treinos extras registrados: continua sugerindo o primeiro', () => {
  const extra = { id: 'tr-extra', nome: 'Cardio', naRotacao: false };
  const r = sugerirTreino([sessao(extra, '2025-09-05')], ROTACAO, '2025-09-08', PADRAO);
  assert.equal(r.treino.nome, 'A');
  assert.equal(r.motivo, MOTIVO.PRIMEIRO);
});

/* ------------------------------------------------------------------ */
/* A fronteira das duas condições de reinício                          */
/* ------------------------------------------------------------------ */

test('as duas condições precisam valer juntas para reiniciar', () => {
  // Segunda 08/09, último treino na própria semana: semana não virou.
  assert.equal(deveReiniciar('2025-09-08', '2025-09-10', PADRAO), false);
  // Domingo 07/09 para segunda 08/09: semana virou, mas só 1 dia.
  assert.equal(deveReiniciar('2025-09-07', '2025-09-08', PADRAO), false);
  // Sábado 06/09 para segunda 08/09: semana virou e passaram 2 dias.
  assert.equal(deveReiniciar('2025-09-06', '2025-09-08', PADRAO), true);
});

test('X é a fronteira exata: X dias reinicia, X-1 não', () => {
  const sessoes = [sessao(B, '2025-09-06')]; // sábado
  assert.equal(sugerido(sessoes, '2025-09-07'), 'C', 'domingo: mesma semana');
  assert.equal(sugerido(sessoes, '2025-09-08'), 'A', 'segunda: 2 dias, reinicia');

  const config3 = { inicioSemana: 1, diasParaReiniciarRotacao: 3 };
  assert.equal(
    sugerido(sessoes, '2025-09-08', ROTACAO, config3),
    'C',
    'com X=3, dois dias ainda não bastam'
  );
  assert.equal(sugerido(sessoes, '2025-09-09', ROTACAO, config3), 'A', 'com X=3, três dias bastam');
});

test('muitas semanas paradas ainda reiniciam no primeiro', () => {
  const sessoes = [sessao(B, '2025-06-10')];
  const r = sugerirTreino(sessoes, ROTACAO, '2025-09-08', PADRAO);
  assert.equal(r.treino.nome, 'A');
  assert.equal(r.motivo, MOTIVO.REINICIO);
  assert.equal(r.diasDesde, 90);
});

test('dentro da mesma semana a sequência não reinicia, mesmo com folga grande', () => {
  // Segunda 08/09 e domingo 14/09 são a mesma semana (começando na segunda).
  const sessoes = [sessao(A, '2025-09-08')];
  assert.equal(sugerido(sessoes, '2025-09-14'), 'B', '6 dias, mas semana não virou');
});

/* ------------------------------------------------------------------ */
/* Dia de início da semana configurável                                */
/* ------------------------------------------------------------------ */

test('mudar o início da semana para domingo muda o resultado', () => {
  const domingo = { inicioSemana: 0, diasParaReiniciarRotacao: 2 };
  const sessoes = [sessao(B, '2025-09-05')]; // sexta

  assert.equal(
    sugerido(sessoes, '2025-09-07', ROTACAO, domingo),
    'A',
    'com semana começando no domingo, 07/09 já é semana nova e passaram 2 dias'
  );
  assert.equal(
    sugerido(sessoes, '2025-09-07'),
    'C',
    'com semana começando na segunda, 07/09 ainda é a mesma semana'
  );
});

/* ------------------------------------------------------------------ */
/* Rotação de qualquer tamanho e ordem                                 */
/* ------------------------------------------------------------------ */

test('rotação de dois treinos alterna entre eles', () => {
  const dois = [A, B];
  assert.equal(sugerido([sessao(A, '2025-09-08')], '2025-09-09', dois), 'B');
  assert.equal(sugerido([sessao(B, '2025-09-08')], '2025-09-09', dois), 'A');
});

test('rotação de um treino só sugere sempre ele', () => {
  const um = [A];
  assert.equal(sugerido([sessao(A, '2025-09-08')], '2025-09-09', um), 'A');
});

test('a ordem da rotação é a que o usuário definiu, não a alfabética', () => {
  const invertida = [C, B, A];
  assert.equal(
    sugerido([sessao(C, '2025-09-08')], '2025-09-09', invertida),
    'B',
    'depois de C vem B nesta ordem'
  );
  assert.equal(
    sugerido([sessao(A, '2025-09-08')], '2025-09-09', invertida),
    'C',
    'A é o último, então dá a volta para C'
  );
});

test('rotação de quatro treinos dá a volta no fim', () => {
  const D = { id: 'tr-d', nome: 'D', naRotacao: true };
  const quatro = [A, B, C, D];
  assert.equal(sugerido([sessao(D, '2025-09-08')], '2025-09-09', quatro), 'A');
  assert.equal(sugerido([sessao(C, '2025-09-08')], '2025-09-09', quatro), 'D');
});

/* ------------------------------------------------------------------ */
/* Casos de borda do histórico                                         */
/* ------------------------------------------------------------------ */

test('a sugestão de um dia ignora as sessões daquele mesmo dia', () => {
  const sessoes = [sessao(A, '2025-09-08'), sessao(B, '2025-09-09')];
  assert.equal(
    sugerido(sessoes, '2025-09-09'),
    'B',
    'o B de 09/09 não conta para a sugestão de 09/09; vale o A do dia anterior'
  );
});

test('registro retroativo muda a sugestão dos dias seguintes', () => {
  const sessoes = [sessao(A, '2025-09-08')];
  assert.equal(sugerido(sessoes, '2025-09-10'), 'B');

  sessoes.push(sessao(B, '2025-09-09'));
  assert.equal(sugerido(sessoes, '2025-09-10'), 'C', 'inserir o B no meio empurra a sequência');
});

test('duas sessões no mesmo dia: vale a criada por último', () => {
  const primeira = sessao(A, '2025-09-08');
  const segunda = sessao(B, '2025-09-08');
  const r = sugerirTreino([primeira, segunda], ROTACAO, '2025-09-09', PADRAO);
  assert.equal(r.ultima.id, segunda.id);
  assert.equal(r.treino.nome, 'C');
});

test('treino tirado da rotação deixa de contar como último', () => {
  const sessoes = [sessao(A, '2025-09-08'), sessao(B, '2025-09-09')];
  const semB = [A, C];
  assert.equal(
    sugerido(sessoes, '2025-09-10', semB),
    'C',
    'sem o B na rotação, o último que conta é o A'
  );
});

test('ultimaSessaoDaRotacao devolve null quando nada se aplica', () => {
  assert.equal(ultimaSessaoDaRotacao([], ROTACAO, '2025-09-08'), null);
  assert.equal(
    ultimaSessaoDaRotacao([sessao(A, '2025-09-10')], ROTACAO, '2025-09-08'),
    null,
    'sessão posterior ao dia não conta'
  );
});

/* ------------------------------------------------------------------ */
/* Explicação mostrada na tela                                         */
/* ------------------------------------------------------------------ */

test('a explicação diz por que o treino foi sugerido', () => {
  const semHistorico = sugerirTreino([], ROTACAO, '2025-09-08', PADRAO);
  assert.match(explicarSugestao(semHistorico), /Primeiro treino/);

  const sequencia = sugerirTreino([sessao(A, '2025-09-08')], ROTACAO, '2025-09-09', PADRAO);
  assert.match(explicarSugestao(sequencia), /Seguindo a rotação/);
  assert.match(explicarSugestao(sequencia), /ontem/);

  const reinicio = sugerirTreino([sessao(B, '2025-09-06')], ROTACAO, '2025-09-08', PADRAO);
  assert.match(explicarSugestao(reinicio), /Semana nova/);

  assert.equal(explicarSugestao(null), '');
});

/* ------------------------------------------------------------------ */
/* Para que dia sugerir (correção: já treinou hoje)                    */
/* ------------------------------------------------------------------ */

test('sem treino hoje, a sugestão é para hoje', () => {
  assert.equal(diaDaProximaSugestao('2025-09-08', []), '2025-09-08');
});

test('com treino hoje, a sugestão passa para amanhã', () => {
  assert.equal(
    diaDaProximaSugestao('2025-09-08', [sessao(A, '2025-09-08')]),
    '2025-09-09',
    'sugerir hoje um treino já feito hoje não ajuda em nada'
  );
});

test('a sugestão de amanhã já conta o treino de hoje', () => {
  const hoje = '2025-09-08';
  const sessoes = [sessao(A, hoje)];
  const dia = diaDaProximaSugestao(hoje, sessoes);
  assert.equal(
    sugerido(sessoes, dia),
    'B',
    'feito o A hoje, amanhã vem o B'
  );
  assert.equal(
    sugerido(sessoes, hoje),
    'A',
    'para hoje ainda diria A, porque a regra ignora as sessões do próprio dia — por isso a tela olha amanhã'
  );
});

test('com dois treinos hoje, ainda olha para amanhã', () => {
  const hoje = '2025-09-08';
  const deHoje = [sessao(A, hoje), sessao(B, hoje)];
  assert.equal(diaDaProximaSugestao(hoje, deHoje), '2025-09-09');
  assert.equal(sugerido(deHoje, '2025-09-09'), 'C', 'vale o último treino do dia');
});

test('a virada do mês não quebra o "amanhã"', () => {
  assert.equal(diaDaProximaSugestao('2025-09-30', [sessao(A, '2025-09-30')]), '2025-10-01');
  assert.equal(diaDaProximaSugestao('2025-12-31', [sessao(A, '2025-12-31')]), '2026-01-01');
});
