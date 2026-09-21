/**
 * Testes da matemática da dieta (especificação, seção 6.7).
 *
 * É a parte do app onde um erro passa despercebido mais fácil: um número
 * errado numa regra de três continua parecendo um número plausível. Por
 * isso os testes conferem contas feitas na mão, e não só "bate consigo
 * mesmo".
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  zeros,
  somar,
  escalar,
  arredondar,
  valoresDeReferencia,
  calcularAlimento,
  calcularPrato,
  calcularItem,
  calcularRefeicao,
  calcularPlano,
  compararComMetas,
  metasDoPlano,
  TIPO_ITEM,
} from '../js/domain/nutricao.js';

/* Alimentos de teste, com números reais do DIETA-DADOS.md. */
const AVEIA = {
  id: 'alim-aveia', nome: 'Aveia', quantidadeRef: 100, unidade: 'g',
  kcal: 380, proteina: 13, gordura: 9, carbo: 55.7, fibra: null,
};
const LEITE = {
  id: 'alim-leite', nome: 'Leite integral', quantidadeRef: 100, unidade: 'ml',
  kcal: 61, proteina: 3.2, gordura: 3.3, carbo: 4.7, fibra: null,
};
const OVO = {
  id: 'alim-ovo', nome: 'Ovo', quantidadeRef: 1, unidade: 'unidade',
  kcal: 72, proteina: 6.3, gordura: 4.8, carbo: 0.4, fibra: null,
};
const PAO_TURCO = {
  id: 'alim-pao-turco', nome: 'Pão turco', quantidadeRef: 100, unidade: 'g',
  kcal: 261, proteina: 9.3, gordura: 3.1, carbo: 46.3, fibra: 3.9,
};
const PRESUNTO = {
  id: 'alim-presunto', nome: 'Presunto fatiado', quantidadeRef: 100, unidade: 'g',
  kcal: 96, proteina: 17, gordura: 1.7, carbo: 3, fibra: null,
};
const ARROZ = {
  id: 'alim-arroz', nome: 'Arroz branco cozido', quantidadeRef: 100, unidade: 'g',
  kcal: 130, proteina: 2.7, gordura: 0.3, carbo: 28.2, fibra: 0.4,
};
const FRANGO = {
  id: 'alim-frango', nome: 'Peito de frango grelhado', quantidadeRef: 100, unidade: 'g',
  kcal: 159, proteina: 32, gordura: 2.5, carbo: 0, fibra: null,
};

const alimentos = new Map(
  [AVEIA, LEITE, OVO, PAO_TURCO, PRESUNTO, ARROZ, FRANGO].map((a) => [a.id, a])
);

const SANDUICHE = {
  id: 'prato-sanduiche',
  nome: 'Sanduíche',
  ingredientes: [
    { alimentoId: 'alim-pao-turco', quantidade: 120 },
    { alimentoId: 'alim-presunto', quantidade: 50 },
  ],
};

const pratos = new Map([[SANDUICHE.id, SANDUICHE]]);
const indice = { alimentos, pratos };

/** Arredonda para comparar sem sofrer com ponto flutuante. */
const r1 = (v) => Math.round(v * 10) / 10;

/* ------------------------------------------------------------------ */
/* Aritmética básica                                                   */
/* ------------------------------------------------------------------ */

test('zeros tem os cinco nutrientes em zero', () => {
  assert.deepEqual(zeros(), { kcal: 0, proteina: 0, gordura: 0, carbo: 0, fibra: 0 });
});

test('somar junta nutriente a nutriente', () => {
  const a = { kcal: 100, proteina: 10, gordura: 5, carbo: 2, fibra: 1 };
  const b = { kcal: 50, proteina: 4, gordura: 1, carbo: 8, fibra: 0 };
  assert.deepEqual(somar(a, b), { kcal: 150, proteina: 14, gordura: 6, carbo: 10, fibra: 1 });
});

test('somar trata campo ausente como zero', () => {
  assert.deepEqual(somar({ kcal: 100 }, {}), { kcal: 100, proteina: 0, gordura: 0, carbo: 0, fibra: 0 });
});

test('escalar multiplica tudo pelo fator', () => {
  const v = { kcal: 100, proteina: 10, gordura: 5, carbo: 2, fibra: 1 };
  assert.deepEqual(escalar(v, 2), { kcal: 200, proteina: 20, gordura: 10, carbo: 4, fibra: 2 });
  assert.deepEqual(escalar(v, 0.5), { kcal: 50, proteina: 5, gordura: 2.5, carbo: 1, fibra: 0.5 });
});

test('arredondar mata o lixo de ponto flutuante', () => {
  assert.equal(arredondar({ kcal: 0.1 + 0.2 }).kcal, 0.3);
});

/* ------------------------------------------------------------------ */
/* A regra de três                                                     */
/* ------------------------------------------------------------------ */

test('a quantidade de referência dá exatamente o valor de referência', () => {
  const { valores } = calcularAlimento(AVEIA, 100);
  assert.equal(valores.kcal, 380);
  assert.equal(valores.proteina, 13);
  assert.equal(r1(valores.carbo), 55.7);
});

test('metade da referência dá metade dos valores', () => {
  const { valores } = calcularAlimento(AVEIA, 50);
  assert.equal(valores.kcal, 190);
  assert.equal(valores.proteina, 6.5);
});

test('40 g de aveia: conta feita na mão', () => {
  // 40 / 100 × 380 = 152 kcal; × 13 = 5,2 g de proteína.
  const { valores } = calcularAlimento(AVEIA, 40);
  assert.equal(valores.kcal, 152);
  assert.equal(r1(valores.proteina), 5.2);
  assert.equal(r1(valores.gordura), 3.6);
  assert.equal(r1(valores.carbo), 22.3);
});

test('300 ml de leite: o triplo da referência de 100 ml', () => {
  const { valores } = calcularAlimento(LEITE, 300);
  assert.equal(valores.kcal, 183);
  assert.equal(r1(valores.proteina), 9.6);
});

test('alimento por unidade: 3 ovos', () => {
  const { valores } = calcularAlimento(OVO, 3);
  assert.equal(valores.kcal, 216);
  assert.equal(r1(valores.proteina), 18.9);
});

test('quantidade maior que a referência escala para cima', () => {
  const { valores } = calcularAlimento(ARROZ, 200);
  assert.equal(valores.kcal, 260);
  assert.equal(r1(valores.carbo), 56.4);
});

test('quantidade zero dá tudo zero, sem erro', () => {
  const r = calcularAlimento(AVEIA, 0);
  assert.deepEqual(r.valores, zeros());
  assert.equal(r.erro, null);
});

/* ------------------------------------------------------------------ */
/* Unidades incompatíveis                                              */
/* ------------------------------------------------------------------ */

test('ml num alimento medido em gramas dá erro, não conta errada', () => {
  const r = calcularAlimento(AVEIA, 100, 'ml');
  assert.match(r.erro, /Unidades incompatíveis/);
  assert.deepEqual(r.valores, zeros(), 'não inventa valor');
});

test('unidade igual à do alimento calcula normalmente', () => {
  assert.equal(calcularAlimento(LEITE, 300, 'ml').erro, null);
  assert.equal(calcularAlimento(OVO, 2, 'unidade').erro, null);
});

test('sem unidade informada, assume a do alimento', () => {
  const r = calcularAlimento(AVEIA, 100);
  assert.equal(r.erro, null);
  assert.equal(r.valores.kcal, 380);
});

test('"unidade" e "g" não se misturam', () => {
  assert.match(calcularAlimento(OVO, 100, 'g').erro, /Unidades incompatíveis/);
});

/* ------------------------------------------------------------------ */
/* Dados faltando                                                      */
/* ------------------------------------------------------------------ */

test('valor em branco conta zero mas marca o item como incompleto', () => {
  const r = calcularAlimento(AVEIA, 100);
  assert.equal(r.valores.fibra, 0, 'a fibra em branco entra como zero');
  assert.equal(r.incompleto, true);
  assert.deepEqual(r.faltando, ['fibra']);
});

test('alimento com tudo preenchido não é incompleto', () => {
  const r = calcularAlimento(PAO_TURCO, 100);
  assert.equal(r.incompleto, false);
  assert.deepEqual(r.faltando, []);
});

test('alimento apagado do índice vira erro, não zero silencioso', () => {
  const r = calcularAlimento(undefined, 100);
  assert.match(r.erro, /não está mais no índice/);
  assert.equal(r.incompleto, true);
});

test('alimento sem quantidade de referência dá erro', () => {
  const quebrado = { ...AVEIA, quantidadeRef: 0 };
  assert.match(calcularAlimento(quebrado, 100).erro, /sem quantidade de referência/);
});

test('quantidade em branco no plano não calcula, mas não quebra', () => {
  const r = calcularAlimento(AVEIA, null);
  assert.deepEqual(r.valores, zeros());
  assert.equal(r.erro, null);
  assert.equal(r.incompleto, true);
});

test('valoresDeReferencia lista todos os campos em branco', () => {
  const vazio = { ...AVEIA, proteina: null, fibra: null };
  const r = valoresDeReferencia(vazio);
  assert.deepEqual(r.faltando.sort(), ['fibra', 'proteina']);
  assert.equal(r.valores.proteina, 0);
});

/* ------------------------------------------------------------------ */
/* Pratos compostos                                                    */
/* ------------------------------------------------------------------ */

test('o prato soma os ingredientes', () => {
  // Pão turco 120 g: 1,2 × 261 = 313,2 kcal
  // Presunto 50 g:   0,5 × 96  =  48   kcal
  const r = calcularPrato(SANDUICHE, alimentos);
  assert.equal(r1(r.valores.kcal), 361.2);
  assert.equal(r1(r.valores.proteina), r1(9.3 * 1.2 + 17 * 0.5));
  assert.equal(r1(r.valores.proteina), 19.7);
});

test('o prato herda o "incompleto" dos ingredientes', () => {
  const r = calcularPrato(SANDUICHE, alimentos);
  assert.equal(r.incompleto, true, 'o presunto está sem fibra');
});

test('prato com ingrediente apagado reporta o erro', () => {
  const quebrado = {
    id: 'p', nome: 'Quebrado',
    ingredientes: [{ alimentoId: 'alim-sumiu', quantidade: 10 }],
  };
  const r = calcularPrato(quebrado, alimentos);
  assert.match(r.erro, /não está mais no índice/);
});

test('prato vazio é incompleto e vale zero', () => {
  const r = calcularPrato({ id: 'p', nome: 'Vazio', ingredientes: [] }, alimentos);
  assert.deepEqual(r.valores, zeros());
  assert.equal(r.incompleto, true);
});

test('prato inexistente vira erro', () => {
  assert.match(calcularPrato(undefined, alimentos).erro, /não existe mais/);
});

test('no plano, o prato é contado em porções', () => {
  const uma = calcularItem(
    { id: 'i1', tipo: TIPO_ITEM.PRATO, pratoId: 'prato-sanduiche', porcoes: 1 },
    indice
  );
  const duas = calcularItem(
    { id: 'i2', tipo: TIPO_ITEM.PRATO, pratoId: 'prato-sanduiche', porcoes: 2 },
    indice
  );
  assert.equal(r1(duas.valores.kcal), r1(uma.valores.kcal * 2));
  assert.equal(r1(duas.valores.kcal), 722.4);
});

test('meia porção de prato conta metade', () => {
  const meia = calcularItem(
    { id: 'i', tipo: TIPO_ITEM.PRATO, pratoId: 'prato-sanduiche', porcoes: 0.5 },
    indice
  );
  assert.equal(r1(meia.valores.kcal), 180.6);
});

/* ------------------------------------------------------------------ */
/* Grupos de opções                                                    */
/* ------------------------------------------------------------------ */

const GRUPO = {
  id: 'g1',
  tipo: TIPO_ITEM.GRUPO,
  nome: 'Carboidrato',
  padraoId: 'o-arroz',
  opcoes: [
    { id: 'o-arroz', tipo: TIPO_ITEM.ALIMENTO, alimentoId: 'alim-arroz', quantidade: 200 },
    { id: 'o-frango', tipo: TIPO_ITEM.ALIMENTO, alimentoId: 'alim-frango', quantidade: 180 },
    { id: 'o-ovo', tipo: TIPO_ITEM.ALIMENTO, alimentoId: 'alim-ovo', quantidade: 6 },
  ],
};

test('o total do grupo usa a opção padrão', () => {
  const r = calcularItem(GRUPO, indice);
  assert.equal(r.valores.kcal, 260, '200 g de arroz');
  assert.equal(r.escolhida.nome, 'Arroz branco cozido');
});

test('sem padrão marcado, usa a primeira opção', () => {
  const r = calcularItem({ ...GRUPO, padraoId: null }, indice);
  assert.equal(r.escolhida.nome, 'Arroz branco cozido');
});

test('a faixa do grupo vai do mínimo ao máximo de cada nutriente', () => {
  // arroz 200 g = 260 kcal; frango 180 g = 286,2; ovo 6 = 432.
  const r = calcularItem(GRUPO, indice);
  assert.equal(r1(r.minimo.kcal), 260);
  assert.equal(r1(r.maximo.kcal), 432);
});

test('a faixa é por nutriente, não pela opção de menor kcal', () => {
  // O arroz tem a menor kcal, mas a menor proteína é dele também (5,4);
  // a maior proteína é do frango (57,6), que NÃO é a maior kcal (ovo).
  const r = calcularItem(GRUPO, indice);
  assert.equal(r1(r.minimo.proteina), 5.4, 'arroz');
  assert.equal(r1(r.maximo.proteina), 57.6, 'frango, mesmo não sendo o de mais kcal');
  assert.equal(r1(r.maximo.kcal), 432, 'ovo tem mais kcal');
});

test('grupo de uma opção só não varia', () => {
  const unico = { ...GRUPO, opcoes: [GRUPO.opcoes[0]], padraoId: 'o-arroz' };
  const r = calcularItem(unico, indice);
  assert.equal(r.minimo.kcal, r.maximo.kcal);
  assert.equal(r.variaKcal, 0);
});

test('grupo sem opção nenhuma reporta erro', () => {
  const r = calcularItem({ id: 'g', tipo: TIPO_ITEM.GRUPO, nome: 'Vazio', opcoes: [] }, indice);
  assert.match(r.erro, /sem opções/);
  assert.equal(r.incompleto, true);
});

test('um grupo pode ter prato entre as opções', () => {
  const comPrato = {
    id: 'g', tipo: TIPO_ITEM.GRUPO, nome: 'Lanche', padraoId: 'o-s',
    opcoes: [
      { id: 'o-s', tipo: TIPO_ITEM.PRATO, pratoId: 'prato-sanduiche', porcoes: 1 },
      { id: 'o-o', tipo: TIPO_ITEM.ALIMENTO, alimentoId: 'alim-ovo', quantidade: 3 },
    ],
  };
  const r = calcularItem(comPrato, indice);
  assert.equal(r1(r.valores.kcal), 361.2);
  assert.equal(r1(r.minimo.kcal), 216, '3 ovos');
});

/* ------------------------------------------------------------------ */
/* Item livre                                                          */
/* ------------------------------------------------------------------ */

test('item livre não entra em conta nenhuma', () => {
  const r = calcularItem({ id: 'i', tipo: TIPO_ITEM.LIVRE, texto: 'Salada à vontade' }, indice);
  assert.deepEqual(r.valores, zeros());
  assert.equal(r.incompleto, false, 'não ter valor é o esperado, não um dado faltando');
  assert.equal(r.livre, true);
  assert.equal(r.nome, 'Salada à vontade');
});

/* ------------------------------------------------------------------ */
/* Refeição                                                            */
/* ------------------------------------------------------------------ */

const CAFE = {
  id: 'ref-cafe',
  nome: 'Café da manhã',
  ordem: 0,
  itens: [
    { id: 'i1', tipo: TIPO_ITEM.ALIMENTO, alimentoId: 'alim-aveia', quantidade: 40 },
    { id: 'i2', tipo: TIPO_ITEM.ALIMENTO, alimentoId: 'alim-leite', quantidade: 300 },
  ],
};

test('a refeição soma os itens', () => {
  // Aveia 40 g = 152 kcal; leite 300 ml = 183 kcal.
  const r = calcularRefeicao(CAFE, indice);
  assert.equal(r1(r.total.kcal), 335);
  assert.equal(r1(r.total.proteina), r1(5.2 + 9.6));
});

test('refeição sem grupo não varia: mínimo igual ao máximo', () => {
  const r = calcularRefeicao(CAFE, indice);
  assert.equal(r.minimo.kcal, r.maximo.kcal);
  assert.equal(r.varia, false);
});

test('refeição com grupo mostra a faixa possível', () => {
  const jantar = { id: 'ref-jantar', nome: 'Jantar', ordem: 3, itens: [GRUPO] };
  const r = calcularRefeicao(jantar, indice);
  assert.equal(r1(r.minimo.kcal), 260);
  assert.equal(r1(r.maximo.kcal), 432);
  assert.equal(r.varia, true);
});

test('o item livre não muda o total nem a faixa da refeição', () => {
  const comLivre = {
    ...CAFE,
    itens: [...CAFE.itens, { id: 'i3', tipo: TIPO_ITEM.LIVRE, texto: 'Café preto' }],
  };
  assert.equal(
    r1(calcularRefeicao(comLivre, indice).total.kcal),
    r1(calcularRefeicao(CAFE, indice).total.kcal)
  );
});

test('a refeição marca incompleto e junta os erros dos itens', () => {
  const comErro = {
    id: 'r', nome: 'Com erro', ordem: 0,
    itens: [{ id: 'i', tipo: TIPO_ITEM.ALIMENTO, alimentoId: 'alim-sumiu', quantidade: 10 }],
  };
  const r = calcularRefeicao(comErro, indice);
  assert.equal(r.incompleto, true);
  assert.equal(r.erros.length, 1);
});

test('refeição vazia soma zero', () => {
  const r = calcularRefeicao({ id: 'r', nome: 'Vazia', itens: [] }, indice);
  assert.deepEqual(r.total, zeros());
  assert.equal(r.varia, false);
});

/* ------------------------------------------------------------------ */
/* Plano do dia e metas                                                */
/* ------------------------------------------------------------------ */

const LANCHE = {
  id: 'ref-lanche', nome: 'Lanche', ordem: 1,
  itens: [{ id: 'i', tipo: TIPO_ITEM.ALIMENTO, alimentoId: 'alim-ovo', quantidade: 3 }],
};
const JANTAR = { id: 'ref-jantar', nome: 'Jantar', ordem: 2, itens: [GRUPO] };

const PLANO = {
  id: 'plano-treino',
  nome: 'Dia de treino',
  metaKcal: 2650,
  metas: { proteina: 160 },
};

test('o plano soma todas as refeições', () => {
  // café 335 + lanche 216 + jantar 260 (padrão) = 811
  const r = calcularPlano(PLANO, [CAFE, LANCHE, JANTAR], indice);
  assert.equal(r1(r.total.kcal), 811);
});

test('as refeições saem na ordem definida', () => {
  const r = calcularPlano(PLANO, [JANTAR, CAFE, LANCHE], indice);
  assert.deepEqual(r.refeicoes.map((x) => x.nome), ['Café da manhã', 'Lanche', 'Jantar']);
});

test('a faixa do dia acumula a variação dos grupos', () => {
  const r = calcularPlano(PLANO, [CAFE, LANCHE, JANTAR], indice);
  assert.equal(r1(r.minimo.kcal), r1(335 + 216 + 260));
  assert.equal(r1(r.maximo.kcal), r1(335 + 216 + 432));
  assert.equal(r.varia, true);
});

test('a comparação com a meta traz diferença e percentual', () => {
  const r = calcularPlano(PLANO, [CAFE, LANCHE, JANTAR], indice);
  assert.equal(r.diferencas.kcal.meta, 2650);
  assert.equal(r1(r.diferencas.kcal.total), 811);
  assert.equal(r1(r.diferencas.kcal.diferenca), r1(811 - 2650));
  assert.ok(r.diferencas.kcal.diferenca < 0, 'faltam calorias para a meta');
});

test('nutriente sem meta não gera comparação', () => {
  const r = calcularPlano(PLANO, [CAFE], indice);
  assert.equal(r.diferencas.gordura, null);
  assert.notEqual(r.diferencas.proteina, null, 'proteína tem meta');
});

test('metasDoPlano aceita a meta de kcal nos dois lugares', () => {
  assert.equal(metasDoPlano({ metaKcal: 2000 }).kcal, 2000);
  assert.equal(metasDoPlano({ metas: { kcal: 2100 } }).kcal, 2100);
  assert.equal(metasDoPlano({}).kcal, null, 'meta em branco é null, não zero');
});

test('compararComMetas calcula o percentual da meta', () => {
  const d = compararComMetas({ kcal: 1325 }, { kcal: 2650 });
  assert.equal(d.kcal.percentual, 50);
  assert.equal(d.kcal.diferenca, -1325);
});

test('meta zero não gera percentual infinito', () => {
  const d = compararComMetas({ kcal: 100 }, { kcal: 0 });
  assert.equal(d.kcal.percentual, null);
  assert.equal(d.kcal.diferenca, 100);
});

test('plano sem refeição nenhuma soma zero', () => {
  const r = calcularPlano(PLANO, [], indice);
  assert.deepEqual(r.total, zeros());
  assert.equal(r.incompleto, false);
});

test('o erro de um item sobe até o plano, dizendo em que refeição está', () => {
  const comErro = {
    id: 'r', nome: 'Almoço', ordem: 0,
    itens: [{ id: 'i', tipo: TIPO_ITEM.ALIMENTO, alimentoId: 'alim-sumiu', quantidade: 10 }],
  };
  const r = calcularPlano(PLANO, [comErro], indice);
  assert.equal(r.erros.length, 1);
  assert.equal(r.erros[0].refeicao, 'Almoço');
});

/* ------------------------------------------------------------------ */
/* Uma refeição compartilhada entre os dois planos                     */
/* ------------------------------------------------------------------ */

test('a mesma refeição em dois planos dá o mesmo resultado', () => {
  const treino = calcularPlano(PLANO, [JANTAR], indice);
  const semTreino = calcularPlano(
    { id: 'p2', nome: 'Dia sem treino', metaKcal: 2300 },
    [JANTAR],
    indice
  );
  assert.deepEqual(treino.refeicoes[0].total, semTreino.refeicoes[0].total);
  assert.notEqual(treino.diferencas.kcal.meta, semTreino.diferencas.kcal.meta);
});

test('mudar o valor de um alimento no índice muda o dia inteiro', () => {
  const antes = calcularPlano(PLANO, [CAFE], indice);

  const corrigido = new Map(alimentos);
  corrigido.set('alim-aveia', { ...AVEIA, kcal: 400 });
  const depois = calcularPlano(PLANO, [CAFE], { alimentos: corrigido, pratos });

  // 40 g: 152 -> 160 kcal, ou seja +8 no dia.
  assert.equal(r1(depois.total.kcal - antes.total.kcal), 8);
});
