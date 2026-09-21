/**
 * Testes das utilidades de data.
 *
 * O que importa aqui: datas locais nunca viram UTC, e diferenças são contadas
 * em dias de calendário (imunes a horário de verão). Na Nova Zelândia o
 * horário de verão muda no último domingo de setembro e no primeiro de abril.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  paraIso,
  deIso,
  diffEmDias,
  somarDias,
  diaDaSemana,
  inicioDaSemana,
  mesmaSemana,
  semanaPosterior,
  descreverDistancia,
  formatarLongo,
  diasNoMes,
} from '../js/utils/date.js';

test('paraIso usa a data local, não a UTC', () => {
  // 1h da manhã de 15/03/2025 no fuso do aparelho.
  const d = new Date(2025, 2, 15, 1, 0, 0);
  assert.equal(paraIso(d), '2025-03-15');
});

test('paraIso e deIso são inversos', () => {
  assert.equal(paraIso(deIso('2025-12-31')), '2025-12-31');
  assert.equal(paraIso(deIso('2024-02-29')), '2024-02-29');
});

test('deIso cria meia-noite local (não desloca o dia)', () => {
  const d = deIso('2025-09-28');
  assert.equal(d.getFullYear(), 2025);
  assert.equal(d.getMonth(), 8);
  assert.equal(d.getDate(), 28);
});

test('diffEmDias conta dias de calendário', () => {
  assert.equal(diffEmDias('2025-03-10', '2025-03-13'), 3);
  assert.equal(diffEmDias('2025-03-13', '2025-03-10'), -3);
  assert.equal(diffEmDias('2025-03-10', '2025-03-10'), 0);
});

test('diffEmDias atravessa mês e ano', () => {
  assert.equal(diffEmDias('2025-01-31', '2025-02-01'), 1);
  assert.equal(diffEmDias('2024-12-31', '2025-01-01'), 1);
  assert.equal(diffEmDias('2024-02-28', '2024-03-01'), 2); // 2024 é bissexto
  assert.equal(diffEmDias('2025-02-28', '2025-03-01'), 1);
});

test('diffEmDias não erra na virada do horário de verão da Nova Zelândia', () => {
  // Fim do horário de verão (abril): um dia tem 25 horas.
  assert.equal(diffEmDias('2025-04-05', '2025-04-06'), 1);
  assert.equal(diffEmDias('2025-04-04', '2025-04-07'), 3);
  // Início do horário de verão (setembro): um dia tem 23 horas.
  assert.equal(diffEmDias('2025-09-27', '2025-09-28'), 1);
  assert.equal(diffEmDias('2025-09-26', '2025-09-29'), 3);
});

test('somarDias respeita virada de mês e bissexto', () => {
  assert.equal(somarDias('2025-01-31', 1), '2025-02-01');
  assert.equal(somarDias('2025-03-01', -1), '2025-02-28');
  assert.equal(somarDias('2024-02-28', 1), '2024-02-29');
  assert.equal(somarDias('2025-12-31', 1), '2026-01-01');
  assert.equal(somarDias('2025-09-28', 0), '2025-09-28');
});

test('diaDaSemana devolve 0 para domingo e 1 para segunda', () => {
  assert.equal(diaDaSemana('2025-09-21'), 0); // domingo
  assert.equal(diaDaSemana('2025-09-22'), 1); // segunda
  assert.equal(diaDaSemana('2025-09-27'), 6); // sábado
});

test('inicioDaSemana com semana começando na segunda', () => {
  assert.equal(inicioDaSemana('2025-09-22', 1), '2025-09-22'); // a própria segunda
  assert.equal(inicioDaSemana('2025-09-27', 1), '2025-09-22'); // sábado
  assert.equal(inicioDaSemana('2025-09-21', 1), '2025-09-15'); // domingo cai na semana anterior
});

test('inicioDaSemana com semana começando no domingo', () => {
  assert.equal(inicioDaSemana('2025-09-21', 0), '2025-09-21');
  assert.equal(inicioDaSemana('2025-09-22', 0), '2025-09-21');
  assert.equal(inicioDaSemana('2025-09-27', 0), '2025-09-21');
});

test('mesmaSemana e semanaPosterior', () => {
  // Domingo 21/09 e segunda 22/09: semanas diferentes quando começa na segunda.
  assert.equal(mesmaSemana('2025-09-21', '2025-09-22', 1), false);
  assert.equal(semanaPosterior('2025-09-21', '2025-09-22', 1), true);
  // Mesma semana: quarta e sexta.
  assert.equal(mesmaSemana('2025-09-24', '2025-09-26', 1), true);
  assert.equal(semanaPosterior('2025-09-24', '2025-09-26', 1), false);
  // Com a semana começando no domingo, 21 e 22 ficam juntos.
  assert.equal(mesmaSemana('2025-09-21', '2025-09-22', 0), true);
});

test('descreverDistancia usa referência explícita', () => {
  assert.equal(descreverDistancia('2025-09-21', '2025-09-21'), 'hoje');
  assert.equal(descreverDistancia('2025-09-20', '2025-09-21'), 'ontem');
  assert.equal(descreverDistancia('2025-09-18', '2025-09-21'), 'há 3 dias');
  assert.equal(descreverDistancia('2025-09-22', '2025-09-21'), 'amanhã');
});

test('formatarLongo e diasNoMes', () => {
  assert.equal(formatarLongo('2025-09-07'), '07/09/2025');
  assert.equal(diasNoMes(2025, 2), 28);
  assert.equal(diasNoMes(2024, 2), 29);
  assert.equal(diasNoMes(2025, 9), 30);
});
