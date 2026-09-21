/**
 * Teste de integração da Etapa 6: a dieta contra o IndexedDB real.
 *
 * A matemática já está coberta em `tests/nutricao.test.js`. O que este
 * verifica é a ligação: a carga inicial do DIETA-DADOS.md, o plano certo
 * para o dia, a escolha de opções persistindo, e a exclusão sem deixar
 * dado órfão.
 *
 *   deno run -A tests/navegador/dieta-integracao.js
 */

import { conectar, lancarNavegador, servir } from './cdp.js';

const raiz = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PORTA_DEVTOOLS = 9233;

const cenario = String.raw`
(async () => {
  const log = [];
  const ok = (nome, real, esperado) =>
    log.push({ nome, passou: JSON.stringify(real) === JSON.stringify(esperado), real, esperado });

  const dieta = await import('/js/services/dieta-service.js');
  const sessoes = await import('/js/services/sessao-service.js');
  const treinos = await import('/js/services/treino-service.js');
  const hoje = (await import('/js/utils/date.js')).hojeIso();

  for (const s of await sessoes.listarSessoes()) await sessoes.apagarSessao(s.id);
  await dieta.voltarAoAutomatico(hoje);

  /* --- carga inicial --- */
  const alimentos = await dieta.listarAlimentos();
  ok('o indice veio do DIETA-DADOS.md', alimentos.length, 34);
  const aveia = alimentos.find((a) => a.id === 'alim-aveia');
  ok('aveia com os valores do rotulo', [aveia.kcal, aveia.proteina, aveia.quantidadeRef, aveia.unidade], [380, 13, 100, 'g']);
  ok('fibra nao informada fica null, nao zero', aveia.fibra, null);

  const polenta = alimentos.find((a) => a.id === 'alim-polenta-cozida');
  ok('o [CONFERIR] do arquivo virou aviso', polenta.conferir, true);

  ok('os dois pratos foram carregados', (await dieta.listarPratos()).length, 2);
  ok('os dois planos foram carregados', (await dieta.listarPlanos()).length, 2);
  ok('sete refeicoes (3 + 3 + o jantar compartilhado)', (await dieta.listarRefeicoes()).length, 7);

  /* --- o plano do dia segue o treino registrado --- */
  let doDia = await dieta.planoDoDia(hoje);
  ok('sem treino hoje, vale o plano de dia sem treino', doDia.plano.tipoDia, 'sem-treino');
  ok('e a escolha foi automatica', doDia.automatico, true);

  const A = (await treinos.listarTreinos()).find((t) => t.nome === 'A');
  const sessao = await sessoes.iniciarSessao(A.id, hoje);
  doDia = await dieta.planoDoDia(hoje);
  ok('com treino registrado, vira dia de treino', doDia.plano.tipoDia, 'treino');

  await dieta.escolherPlanoDoDia(hoje, 'plano-dia-sem-treino');
  doDia = await dieta.planoDoDia(hoje);
  ok('a escolha manual vence o automatico', doDia.plano.tipoDia, 'sem-treino');
  ok('e a tela sabe que foi manual', doDia.automatico, false);

  await dieta.voltarAoAutomatico(hoje);
  ok('voltando ao automatico, o treino manda de novo', (await dieta.planoDoDia(hoje)).plano.tipoDia, 'treino');

  /* --- calculo do dia, conferido na mao --- */
  const dia = await dieta.calcularDia('plano-dia-de-treino');
  ok('o dia tem quatro refeicoes', dia.refeicoes.length, 4);

  const cafe = dia.refeicoes.find((r) => r.nome === 'Cafe da manha' || r.nome === 'Café da manhã');
  // aveia 40 g = 152; leite 300 ml = 183; proteina 40 g = 155,6. Total 490,6.
  ok('o cafe da manha bate com a conta na mao', Math.round(cafe.total.kcal * 10) / 10, 490.6);

  const jantar = dia.refeicoes.find((r) => r.nome === 'Jantar');
  ok('o jantar varia por causa dos grupos', jantar.varia, true);
  ok('o jantar tem dois grupos, um livre e o azeite', jantar.itens.length, 4);
  const livre = jantar.itens.find((i) => i.livre);
  ok('o item livre nao soma nada', livre.valores.kcal, 0);

  // Carboidrato padrao = arroz 200 g = 260 kcal.
  const carbo = jantar.itens.find((i) => i.nome === 'Carboidrato');
  ok('o grupo usa a opcao padrao', Math.round(carbo.valores.kcal), 260);
  ok('e conhece a faixa das opcoes', carbo.maximo.kcal > carbo.minimo.kcal, true);

  ok('a meta de kcal do dia de treino', dia.diferencas.kcal.meta, 2650);
  ok('o dia esta marcado como incompleto', dia.incompleto, true, 'os sanduiches tem quantidade [PREENCHER]');

  /* --- trocar a opcao do grupo persiste --- */
  const opcaoMassa = carbo.opcoes.find((o) => o.nome === 'Massa cozida');
  await dieta.escolherOpcao('ref-jantar', 'it-jantar-carbo', opcaoMassa.opcaoId);
  const depois = await dieta.calcularDia('plano-dia-de-treino');
  const carboDepois = depois.refeicoes.find((r) => r.nome === 'Jantar').itens.find((i) => i.nome === 'Carboidrato');
  ok('a troca de opcao fica salva', carboDepois.escolhida.nome, 'Massa cozida');
  // massa 180 g = 1,8 x 158 = 284,4
  ok('e muda o total do dia', Math.round(carboDepois.valores.kcal * 10) / 10, 284.4);

  /* --- o jantar e compartilhado pelos dois planos --- */
  const semTreino = await dieta.calcularDia('plano-dia-sem-treino');
  const jantarSemTreino = semTreino.refeicoes.find((r) => r.nome === 'Jantar');
  ok(
    'o jantar e o mesmo nos dois planos',
    Math.round(jantarSemTreino.total.kcal * 10) / 10,
    Math.round(depois.refeicoes.find((r) => r.nome === 'Jantar').total.kcal * 10) / 10
  );
  ok('mas as metas sao diferentes', semTreino.diferencas.kcal.meta, 2300);

  await dieta.escolherOpcao('ref-jantar', 'it-jantar-carbo', 'op-carbo-arroz');

  /* --- corrigir o indice muda o dia --- */
  const antesDaCorrecao = (await dieta.calcularDia('plano-dia-de-treino')).total.kcal;
  await dieta.salvarAlimento({ ...aveia, kcal: 400 });
  const depoisDaCorrecao = (await dieta.calcularDia('plano-dia-de-treino')).total.kcal;
  // aveia aparece 2x no dia de treino: 40 g no cafe e 40 g no lanche 2.
  ok('corrigir um valor do indice recalcula o dia', Math.round(depoisDaCorrecao - antesDaCorrecao), 16);
  await dieta.salvarAlimento({ ...aveia, kcal: 380 });

  /* --- onde um alimento e usado --- */
  const usoAveia = await dieta.ondeAlimentoEUsado('alim-aveia');
  ok('o app sabe em que refeicoes a aveia esta', usoAveia.refeicoes.length > 0, true);
  const usoArroz = await dieta.ondeAlimentoEUsado('alim-arroz-branco');
  ok('e acha tambem dentro de um grupo de opcoes', usoArroz.refeicoes, ['Jantar']);
  const usoPao = await dieta.ondeAlimentoEUsado('alim-pao-turco');
  ok('e dentro de pratos compostos', usoPao.pratos.length, 2);

  /* --- excluir sem deixar orfao --- */
  const novo = await dieta.criarAlimento({ nome: 'Alimento de teste', quantidadeRef: 100, unidade: 'g', kcal: 100 });
  await dieta.adicionarItem('ref-jantar', { tipo: 'alimento', alimentoId: novo.id, quantidade: 50 });
  ok('o item entrou no jantar', (await dieta.ondeAlimentoEUsado(novo.id)).refeicoes, ['Jantar']);

  await dieta.excluirAlimento(novo.id);
  ok('excluir tira o item da refeicao', (await dieta.ondeAlimentoEUsado(novo.id)).refeicoes, []);
  ok('e o alimento some do indice', await dieta.buscarAlimento(novo.id), undefined);
  const jantarFinal = (await dieta.calcularDia('plano-dia-de-treino')).refeicoes.find((r) => r.nome === 'Jantar');
  ok('o jantar volta a ter 4 itens', jantarFinal.itens.length, 4);

  /* --- editar as refeicoes de um plano --- */
  const antesDoPlano = (await dieta.buscarPlano('plano-dia-de-treino')).refeicoes.length;
  const nova = await dieta.criarRefeicaoNoPlano('plano-dia-de-treino', 'Ceia');
  ok('a refeicao nova entra no fim do plano', (await dieta.buscarPlano('plano-dia-de-treino')).refeicoes.length, antesDoPlano + 1);
  ok('e aparece no dia calculado', (await dieta.calcularDia('plano-dia-de-treino')).refeicoes.at(-1).nome, 'Ceia');

  await dieta.moverRefeicaoNoPlano('plano-dia-de-treino', nova.id, -1);
  const depoisDeMover = await dieta.calcularDia('plano-dia-de-treino');
  ok('subir muda a ordem dentro do plano', depoisDeMover.refeicoes.at(-2).nome, 'Ceia');

  // A ordem e do plano, nao da refeicao: o jantar segue no lugar dele no outro plano.
  const outroPlano = await dieta.calcularDia('plano-dia-sem-treino');
  ok('o outro plano nao foi afetado', outroPlano.refeicoes.at(-1).nome, 'Jantar');

  await dieta.adicionarRefeicaoAoPlano('plano-dia-sem-treino', nova.id);
  ok('a mesma refeicao pode estar nos dois planos', (await dieta.planosComRefeicao(nova.id)).length, 2);

  let r = await dieta.removerRefeicaoDoPlano('plano-dia-de-treino', nova.id);
  ok('tirar de um plano nao apaga a refeicao compartilhada', r.apagada, false);
  ok('ela continua no outro', (await dieta.planosComRefeicao(nova.id)).length, 1);

  r = await dieta.removerRefeicaoDoPlano('plano-dia-sem-treino', nova.id);
  ok('tirar do ultimo plano apaga a refeicao', r.apagada, true);
  ok('e o plano volta ao tamanho original', (await dieta.buscarPlano('plano-dia-de-treino')).refeicoes.length, antesDoPlano);

  ok(
    'refeicoesForaDoPlano nao lista as que ja estao nele',
    (await dieta.refeicoesForaDoPlano('plano-dia-de-treino')).some((x) => x.nome === 'Jantar'),
    false
  );

  /* --- editar um grupo de opcoes --- */
  const antesOpcoes = (await dieta.calcularDia('plano-dia-de-treino')).refeicoes.find((x) => x.nome === 'Jantar').itens.find((i) => i.nome === 'Carboidrato').opcoes.length;
  await dieta.adicionarOpcao('ref-jantar', 'it-jantar-carbo', { tipo: 'alimento', alimentoId: 'alim-batata-doce', quantidade: 200 });
  const grupoDepois = (await dieta.calcularDia('plano-dia-de-treino')).refeicoes.find((x) => x.nome === 'Jantar').itens.find((i) => i.nome === 'Carboidrato');
  ok('da para adicionar opcao ao grupo', grupoDepois.opcoes.length, antesOpcoes + 1);
  ok('a nova opcao tem a quantidade certa', grupoDepois.opcoes.at(-1).descricao, '200 g');

  const novaOpcao = grupoDepois.opcoes.at(-1);
  await dieta.escolherOpcao('ref-jantar', 'it-jantar-carbo', novaOpcao.opcaoId);
  await dieta.removerOpcao('ref-jantar', 'it-jantar-carbo', novaOpcao.opcaoId);
  const grupoFinal = (await dieta.calcularDia('plano-dia-de-treino')).refeicoes.find((x) => x.nome === 'Jantar').itens.find((i) => i.nome === 'Carboidrato');
  ok('remover a opcao padrao promove outra', grupoFinal.escolhida !== null, true);
  ok('e o grupo volta ao tamanho original', grupoFinal.opcoes.length, antesOpcoes);

  /* --- limpeza --- */
  await dieta.escolherOpcao('ref-jantar', 'it-jantar-carbo', 'op-carbo-arroz');
  await sessoes.apagarSessao(sessao.id);
  await dieta.voltarAoAutomatico(hoje);
  ok('banco limpo ao fim', (await sessoes.listarSessoes()).length, 0);

  return log;
})()
`;

const servidor = servir(raiz.replace(/\/$/, ''));
const navegador = await lancarNavegador({
  url: `http://localhost:${servidor.porta}/`,
  porta: PORTA_DEVTOOLS,
});

let codigoSaida = 1;
// Declarado fora do try para o finally conseguir fechar o navegador pelo
// protocolo, que e o unico jeito confiavel de soltar o perfil temporario.
let cdp = null;
try {
  cdp = await conectar(PORTA_DEVTOOLS);
  await cdp.enviar('Page.enable');
  await cdp.enviar('Runtime.enable');

  const alvo = `http://localhost:${servidor.porta}/`;
  for (let i = 0; i < 40; i += 1) {
    if ((await cdp.avaliar('location.href')) === alvo) break;
    await cdp.enviar('Page.navigate', { url: alvo });
    await new Promise((r) => setTimeout(r, 250));
  }
  for (let i = 0; i < 60; i += 1) {
    const quantos = await cdp.avaliar(
      `(async () => { try { const d = await import('/js/data/dieta-repo.js'); return (await d.listarAlimentos()).length; } catch { return 0; } })()`
    );
    if (quantos > 0) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  const log = await cdp.avaliar(cenario);
  const falhas = log.filter((t) => !t.passou);
  log.forEach((t) => {
    if (t.passou) return console.log(`  ok    ${t.nome}`);
    console.log(`  FALHA ${t.nome}`);
    console.log(`        esperado: ${JSON.stringify(t.esperado)}`);
    console.log(`        obtido:   ${JSON.stringify(t.real)}`);
  });
  console.log(`\n${log.length - falhas.length} passaram | ${falhas.length} falharam`);
  codigoSaida = falhas.length ? 1 : 0;
} catch (erro) {
  console.error('Erro:', erro.message);
} finally {
  await navegador.encerrar(cdp);
  await servidor.parar();
  Deno.exit(codigoSaida);
}
