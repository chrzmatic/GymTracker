/** Testes da conversão de kJ para kcal. */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KJ_POR_KCAL,
  UNIDADES_ENERGIA,
  kjParaKcal,
  energiaEmKcal,
  calcularAlimento,
} from '../js/domain/nutricao.js';

test('a constante é a da caloria termoquímica: 1 kcal = 4,184 kJ', () => {
  assert.equal(KJ_POR_KCAL, 4.184);
});

test('kJ vira kcal arredondado para inteiro', () => {
  assert.equal(kjParaKcal(4.184), 1);
  assert.equal(kjParaKcal(418.4), 100);
  assert.equal(kjParaKcal(1000), 239);
  assert.equal(kjParaKcal(2000), 478);
  // 1550 / 4,184 = 370,45… → 370
  assert.equal(kjParaKcal(1550), 370);
  // 1040 kJ (pão de forma) = 248,57… → 249 kcal
  assert.equal(kjParaKcal(1040), 249);
});

test('kJ aceita texto numérico (como vem do formulário)', () => {
  assert.equal(kjParaKcal('418.4'), 100);
});

test('kJ zero é zero kcal, não "em branco"', () => {
  assert.equal(kjParaKcal(0), 0);
  assert.equal(energiaEmKcal(0, UNIDADES_ENERGIA.KJ), 0);
});

test('kJ em branco ou inválido devolve null, nunca zero nem NaN', () => {
  for (const vazio of [null, undefined, '', 'abc', NaN, Infinity]) {
    assert.equal(kjParaKcal(vazio), null, `entrada ${String(vazio)}`);
    assert.equal(energiaEmKcal(vazio, UNIDADES_ENERGIA.KJ), null);
    assert.equal(energiaEmKcal(vazio, UNIDADES_ENERGIA.KCAL), null);
  }
});

test('em kcal o valor passa sem conversão nem arredondamento', () => {
  assert.equal(energiaEmKcal(130, UNIDADES_ENERGIA.KCAL), 130);
  assert.equal(energiaEmKcal(130.37, UNIDADES_ENERGIA.KCAL), 130.37);
  assert.equal(energiaEmKcal(130), 130, 'sem unidade, assume kcal');
});

test('unidade desconhecida é tratada como kcal (não inventa conversão)', () => {
  assert.equal(energiaEmKcal(100, 'cal'), 100);
});

test('o resultado é sempre inteiro, nunca valor quebrado', () => {
  for (let kj = 0; kj <= 5000; kj += 7.3) {
    assert.ok(Number.isInteger(kjParaKcal(kj)), `${kj} kJ`);
  }
});

test('converter de volta dá o valor original', () => {
  for (const kcal of [1, 52, 130, 261, 717, 884]) {
    assert.equal(kjParaKcal(kcal * KJ_POR_KCAL), kcal, `${kcal} kcal`);
  }
});

test('alimento cadastrado a partir de kJ calcula como se fosse kcal', () => {
  // 544 kJ por 100 g = 130 kcal (arroz); 200 g → 260 kcal.
  const arroz = {
    id: 'a',
    nome: 'Arroz',
    quantidadeRef: 100,
    unidade: 'g',
    kcal: energiaEmKcal(544, UNIDADES_ENERGIA.KJ),
    proteina: 2.7,
    gordura: 0.3,
    carbo: 28.2,
    fibra: 0.4,
  };
  assert.equal(arroz.kcal, 130);
  assert.equal(calcularAlimento(arroz, 200).valores.kcal, 260);
});
