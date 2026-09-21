/**
 * Testes da grade do calendário.
 *
 * O que pode dar errado aqui: a primeira linha começar no dia errado, um
 * mês perder ou ganhar um dia na virada, e fevereiro bissexto. Tudo isso
 * com o dia de início da semana configurável.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  montarMes,
  rotulosDaSemana,
  agruparPorData,
  mesVizinho,
  resumoDoMes,
  acoesDoDia,
} from '../js/domain/calendario.js';

/** Achata as semanas numa lista de datas. */
const todas = (grade) => grade.semanas.flat().map((c) => c.iso);
/** Só os dias que pertencem ao mês. */
const doMes = (grade) => grade.semanas.flat().filter((c) => c.doMes).map((c) => c.iso);

test('a grade é sempre retangular, em múltiplos de 7', () => {
  for (let mes = 1; mes <= 12; mes += 1) {
    const grade = montarMes(2025, mes, 1);
    assert.equal(todas(grade).length % 7, 0, `mês ${mes}`);
    grade.semanas.forEach((semana) => assert.equal(semana.length, 7));
  }
});

test('setembro de 2025 começa numa segunda: a primeira linha não tem recuo', () => {
  const grade = montarMes(2025, 9, 1);
  assert.equal(grade.semanas[0][0].iso, '2025-09-01');
  assert.equal(grade.semanas[0][0].doMes, true);
  assert.equal(grade.primeiro, '2025-09-01');
  assert.equal(grade.ultimo, '2025-09-30');
});

test('com a semana começando no domingo, setembro de 2025 recua um dia', () => {
  const grade = montarMes(2025, 9, 0);
  assert.equal(grade.semanas[0][0].iso, '2025-08-31');
  assert.equal(grade.semanas[0][0].doMes, false, 'o dia 31/08 é do mês anterior');
  assert.equal(grade.semanas[0][1].iso, '2025-09-01');
});

test('a grade traz todos os dias do mês, em ordem e sem repetir', () => {
  const grade = montarMes(2025, 9, 1);
  const dias = doMes(grade);
  assert.equal(dias.length, 30);
  assert.equal(dias[0], '2025-09-01');
  assert.equal(dias[29], '2025-09-30');
  assert.equal(new Set(dias).size, 30);
});

test('as datas da grade são consecutivas, inclusive nas pontas', () => {
  const grade = montarMes(2025, 3, 1);
  const lista = todas(grade);
  for (let i = 1; i < lista.length; i += 1) {
    const anterior = new Date(lista[i - 1] + 'T12:00:00');
    const atual = new Date(lista[i] + 'T12:00:00');
    const dias = Math.round((atual - anterior) / 86400000);
    assert.equal(dias, 1, `${lista[i - 1]} -> ${lista[i]}`);
  }
});

test('fevereiro bissexto tem 29 dias', () => {
  assert.equal(doMes(montarMes(2024, 2, 1)).length, 29);
  assert.equal(doMes(montarMes(2025, 2, 1)).length, 28);
});

test('fevereiro de 2026 começa num domingo e cabe em quatro linhas', () => {
  const grade = montarMes(2026, 2, 0);
  assert.equal(grade.semanas[0][0].iso, '2026-02-01');
  assert.equal(grade.semanas.length, 4, '28 dias começando no primeiro dia da semana');
});

test('dezembro atravessa o ano sem perder dias', () => {
  const grade = montarMes(2025, 12, 1);
  const dias = doMes(grade);
  assert.equal(dias.length, 31);
  assert.equal(dias[30], '2025-12-31');
  assert.ok(todas(grade).includes('2026-01-01'), 'a última linha entra em janeiro');
});

test('janeiro puxa dias do ano anterior', () => {
  const grade = montarMes(2025, 1, 1);
  assert.equal(grade.semanas[0][0].iso, '2024-12-30', '01/01/2025 é uma quarta');
});

/* ---- rótulos ---- */

test('os rótulos seguem o dia de início da semana', () => {
  assert.deepEqual(rotulosDaSemana(1), ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']);
  assert.deepEqual(rotulosDaSemana(0), ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']);
});

/* ---- navegação entre meses ---- */

test('mesVizinho atravessa a virada do ano nos dois sentidos', () => {
  assert.deepEqual(mesVizinho(2025, 12, 1), { ano: 2026, mes: 1 });
  assert.deepEqual(mesVizinho(2025, 1, -1), { ano: 2024, mes: 12 });
  assert.deepEqual(mesVizinho(2025, 6, 1), { ano: 2025, mes: 7 });
  assert.deepEqual(mesVizinho(2025, 6, -1), { ano: 2025, mes: 5 });
});

/* ---- sessões no calendário ---- */

const sessoes = [
  { id: 's1', data: '2025-09-01', treinoId: 'tr-a', treinoNome: 'A', cor: '#00f', criadaEm: 1 },
  { id: 's2', data: '2025-09-03', treinoId: 'tr-b', treinoNome: 'B', cor: '#0f0', criadaEm: 2 },
  { id: 's3', data: '2025-09-03', treinoId: 'tr-a', treinoNome: 'A', cor: '#00f', criadaEm: 3 },
  { id: 's4', data: '2025-09-08', treinoId: 'tr-a', treinoNome: 'A', cor: '#00f', criadaEm: 4 },
];

test('agruparPorData junta as sessões do mesmo dia, na ordem de criação', () => {
  const mapa = agruparPorData(sessoes);
  assert.deepEqual([...mapa.keys()].sort(), ['2025-09-01', '2025-09-03', '2025-09-08']);
  assert.deepEqual(mapa.get('2025-09-03').map((s) => s.id), ['s2', 's3']);
  assert.equal(mapa.get('2025-09-15'), undefined);
});

test('resumoDoMes conta por treino, do mais frequente para o menos', () => {
  const r = resumoDoMes(sessoes);
  assert.equal(r.total, 4);
  assert.deepEqual(r.porTreino.map((t) => [t.nome, t.quantas]), [
    ['A', 3],
    ['B', 1],
  ]);
});

test('resumoDoMes de um mês sem treino', () => {
  assert.deepEqual(resumoDoMes([]), { total: 0, porTreino: [] });
});

/* ------------------------------------------------------------------ */
/* O que tocar num dia oferece (correção da inconsistência)            */
/* ------------------------------------------------------------------ */

const umaSessao = [{ id: 's1', treinoNome: 'A' }];

test('dia passado vazio deixa registrar', () => {
  const a = acoesDoDia('2025-09-01', [], '2025-09-08');
  assert.deepEqual(a, { abrir: [], podeRegistrar: true, futuro: false });
});

test('dia passado com treino deixa abrir E registrar outro', () => {
  const a = acoesDoDia('2025-09-01', umaSessao, '2025-09-08');
  assert.deepEqual(a.abrir, ['s1']);
  assert.equal(a.podeRegistrar, true, 'mais de uma sessão no mesmo dia é permitida');
});

test('hoje se comporta igual aos dias passados, com ou sem treino', () => {
  const hoje = '2025-09-08';
  assert.deepEqual(acoesDoDia(hoje, [], hoje), {
    abrir: [],
    podeRegistrar: true,
    futuro: false,
  });
  assert.equal(
    acoesDoDia(hoje, umaSessao, hoje).podeRegistrar,
    true,
    'era esta a inconsistência: com treino hoje, não dava para registrar outro'
  );
});

test('dia futuro não registra nada', () => {
  const a = acoesDoDia('2025-09-20', [], '2025-09-08');
  assert.equal(a.futuro, true);
  assert.equal(a.podeRegistrar, false);
});

test('dia futuro com sessão registrada ainda deixa abrir', () => {
  const a = acoesDoDia('2025-09-20', umaSessao, '2025-09-08');
  assert.deepEqual(a.abrir, ['s1']);
  assert.equal(a.podeRegistrar, false);
});

test('todas as sessões do dia ficam disponíveis para abrir', () => {
  const duas = [{ id: 's1' }, { id: 's2' }];
  assert.deepEqual(acoesDoDia('2025-09-01', duas, '2025-09-08').abrir, ['s1', 's2']);
});
