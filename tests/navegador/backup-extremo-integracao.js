/**
 * Exportar e importar (Etapa 7) depois de mexer em **tudo**.
 *
 * A pergunta que motivou este teste: se eu reformar o app inteiro — dieta,
 * músculos existentes, rotação, treino extra, exercícios apagados,
 * configurações, peso — o export/import quebra em algum lugar?
 *
 * Os testes de `progresso-backup-integracao.js` já cobrem o ciclo normal.
 * Este vai ao extremo de propósito, porque é onde moram os defeitos que
 * um ciclo normal não encontra:
 *
 *  - uma tabela que ficou de fora do export e só se percebe ao restaurar;
 *  - uma referência órfã (série apontando para exercício apagado, item de
 *    treino apontando para músculo que não existe mais);
 *  - ordem de listas (rotação, ordem dos músculos, itens do plano) que
 *    sobrevive à gravação mas não à releitura.
 *
 * A prova é forte: depois de esvaziar o banco inteiro e importar, o
 * retrato do banco tem que ser **idêntico**, campo por campo, ao de antes.
 *
 *   deno run -A tests/navegador/backup-extremo-integracao.js
 */

import { conectar, lancarNavegador, servir } from './cdp.js';

const raiz = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PORTA_DEVTOOLS = 9235;

const cenario = String.raw`
(async () => {
  const log = [];
  const ok = (nome, real, esperado) =>
    log.push({ nome, passou: JSON.stringify(real) === JSON.stringify(esperado), real, esperado });

  const seed = await import('/js/services/seed-service.js');
  const backup = await import('/js/services/backup-service.js');
  const exSvc = await import('/js/services/exercicio-service.js');
  const trSvc = await import('/js/services/treino-service.js');
  const sessoes = await import('/js/services/sessao-service.js');
  const peso = await import('/js/services/peso-service.js');
  const dieta = await import('/js/services/dieta-service.js');
  const dietaRepo = await import('/js/data/dieta-repo.js');
  const configRepo = await import('/js/data/config-repo.js');

  await backup.apagarTudo();
  await seed.carregarSeNecessario();

  /* ================================================================ */
  /* 1. Reforma total                                                  */
  /* ================================================================ */

  // --- músculos: renomear um existente, criar, reordenar, apagar ---
  const musculos = await exSvc.listarMusculos();
  const peito = musculos.find((m) => m.nome.toLowerCase().includes('peito')) || musculos[0];
  await exSvc.salvarMusculoEditado({ ...peito, nome: 'Peitoral Renomeado' });
  const musNovo = await exSvc.criarMusculo('Músculo Inventado');
  await exSvc.moverMusculo(musNovo.id, -1);
  const musDescartavel = await exSvc.criarMusculo('Some Depois');
  await exSvc.excluirMusculo(musDescartavel.id);

  // --- exercícios: criar com músculos e frações, editar, apagar ---
  const exNovo = await exSvc.criar('Exercício Inventado', 'assistido', [
    { musculoId: musNovo.id, direto: true, fracao: 1 },
    { musculoId: peito.id, direto: false, fracao: 0.5 },
  ]);
  const todosEx = await exSvc.listarExercicios();
  const exVitima = todosEx.find((e) => e.id !== exNovo.id);
  await exSvc.excluir(exVitima.id);

  // --- treinos: criar extra, mexer na rotação, tirar da rotação, apagar ---
  const extra = await trSvc.criarTreino('Treino Extra Z', false);
  await trSvc.adicionarItem(extra, exNovo.id);
  const rotacao = await trSvc.listarTreinos();
  const A = rotacao.find((t) => t.nome === 'A');
  const C = rotacao.find((t) => t.nome === 'C');
  await trSvc.alternarNaRotacao(C.id);
  await trSvc.moverTreinoNaLista(A.id, 1);
  const paraApagar = await trSvc.criarTreino('Treino Que Some', true);
  await trSvc.excluirTreino(paraApagar.id);

  // --- histórico: sessões de verdade, com séries ---
  for (const data of ['2026-09-10', '2026-09-12', '2026-09-15']) {
    const s = await sessoes.iniciarSessao(A.id, data);
    const carregada = await sessoes.carregarSessao(s.id);
    for (const item of carregada.sessao.itens.slice(0, 3)) {
      await sessoes.adicionarSerie(carregada.sessao, item, [], false);
      await sessoes.adicionarSerie(carregada.sessao, item, [], true);
    }
    await sessoes.finalizarSessao(carregada.sessao);
  }

  // --- peso corporal ---
  await peso.registrar('2026-09-01', 82.4);
  await peso.registrar('2026-09-15', 81.9);

  // --- dieta: alimento, prato composto, refeição, plano, dia marcado ---
  const alimento = await dieta.criarAlimento({
    nome: 'Alimento Inventado',
    unidade: 'g',
    porcao: 100,
    kcal: 123,
    proteina: 12.3,
    carboidrato: 4.5,
    gordura: 6.7,
  });
  const prato = await dieta.criarPrato('Prato Inventado');
  const planos = await dietaRepo.listarPlanos();
  const plano = planos[0];
  const refeicao = await dieta.criarRefeicaoNoPlano(plano.id, 'Refeição Inventada');
  await dieta.adicionarItem(refeicao.id, { alimentoId: alimento.id, quantidade: 150 });
  await dieta.renomearPlano(plano.id, 'Plano Renomeado');
  await dieta.escolherPlanoDoDia('2026-09-22', plano.id);
  const alimentos = await dietaRepo.listarAlimentos();
  const comidaVitima = alimentos.find((a) => a.id !== alimento.id);
  await dieta.excluirAlimento(comidaVitima.id);

  // --- configurações ---
  await configRepo.salvarConfig('inicioSemana', 0);
  await configRepo.salvarConfig('diasParaReiniciarRotacao', 5);

  /* ================================================================ */
  /* 2. O retrato antes                                                */
  /* ================================================================ */

  // A ordem que a tela mostra, que NÃO é a ordem bruta da tabela: o
  // IndexedDB devolve por ID, e a lista de músculos é ordenada por
  // posição. Comparar as duas é comparar coisas diferentes — a que
  // interessa preservar é esta, a que você arrumou na mão.
  const ordemMusculosAntes = (await exSvc.listarMusculos()).map((m) => m.id);
  const ordemTreinosAntes = (await trSvc.listarTreinos()).map((t) => t.id);

  const antes = await backup.montarBackup();
  const stores = Object.keys(antes.dados).sort();
  ok('o backup cobre todas as tabelas do banco', stores.length >= 12, true);

  const contagemAntes = {};
  stores.forEach((s) => { contagemAntes[s] = antes.dados[s].length; });
  ok('há histórico de verdade dentro', contagemAntes.sessoes, 3);
  ok('e séries de verdade', contagemAntes.series, 18);
  ok('o descrever não mente sobre estar vazio', backup.descreverBackup(antes).includes('3'), true);

  const json = JSON.stringify(antes);
  ok('a reforma toda está no arquivo', json.includes('Peitoral Renomeado'), true);
  ok('inclusive o treino extra', json.includes('Treino Extra Z'), true);
  ok('e o alimento inventado', json.includes('Alimento Inventado'), true);
  ok('o que foi apagado não está', json.includes('Treino Que Some'), false);

  /* ================================================================ */
  /* 3. Esvaziar o banco inteiro e importar de volta                   */
  /* ================================================================ */

  await backup.apagarTudo();
  for (const s of stores) {
    if ((await backup.montarBackup()).dados[s].length !== 0) {
      ok('o banco deveria estar vazio em ' + s, false, true);
    }
  }
  ok('banco realmente zerado', (await backup.montarBackup()).dados.sessoes.length, 0);

  // Passa pelo mesmo caminho do "Importar JSON": texto → parse → validar.
  const relido = JSON.parse(json);
  const validacao = backup.validarBackup(relido);
  ok('o arquivo exportado passa na validação', validacao.ok, true);

  await backup.restaurar(relido);
  const divergencias = await backup.conferirRestauracao(relido);
  ok('a conferência não acha divergência', divergencias, []);

  /* ================================================================ */
  /* 4. A prova: o retrato tem que ser idêntico                        */
  /* ================================================================ */

  const depois = await backup.montarBackup();

  stores.forEach((s) => {
    ok(
      'tabela ' + s + ' voltou idêntica',
      JSON.stringify(depois.dados[s]),
      JSON.stringify(antes.dados[s])
    );
  });

  /* ================================================================ */
  /* 5. E o app continua funcionando em cima do que foi restaurado     */
  /* ================================================================ */

  const musDepois = await exSvc.listarMusculos();
  ok('o músculo renomeado continua renomeado', musDepois.some((m) => m.nome === 'Peitoral Renomeado'), true);
  ok('e o apagado continua apagado', musDepois.some((m) => m.nome === 'Some Depois'), false);
  ok('a ordem dos músculos sobreviveu', musDepois.map((m) => m.id), ordemMusculosAntes);
  ok(
    'e a ordem dos treinos também',
    (await trSvc.listarTreinos()).map((t) => t.id),
    ordemTreinosAntes
  );

  const trDepois = await trSvc.listarTreinosAgrupados();
  ok('o treino extra continua fora da rotação', trDepois.extras.some((t) => t.nome === 'Treino Extra Z'), true);
  ok('o C continua tirado da rotação', trDepois.rotacao.some((t) => t.nome === 'C'), false);

  const exApagado = await exSvc.buscarExercicio(exVitima.id);
  ok('o exercício apagado não ressuscitou', exApagado, undefined);

  // A pergunta mais fina: o histórico guarda séries daquele exercício
  // apagado. O app tem que conseguir abrir essa sessão assim mesmo.
  const hist = await sessoes.historico();
  ok('o histórico continua com as 3 sessões', hist.length, 3);
  const umaSessao = await sessoes.carregarSessao(hist[0].sessao.id);
  ok('e uma sessão do histórico abre sem estourar', Boolean(umaSessao && umaSessao.sessao), true);

  const dia = await dieta.planoDoDia('2026-09-22');
  ok('o dia marcado continua apontando para o plano', dia.plano.nome, 'Plano Renomeado');
  const calculado = await dieta.calcularDia(dia.plano.id);
  ok('e o cálculo da dieta roda em cima do restaurado', Number.isFinite(calculado.total.kcal), true);

  const cfg = await configRepo.lerTodasConfigs();
  ok('as configurações voltaram', [cfg.inicioSemana, cfg.diasParaReiniciarRotacao], [0, 5]);

  const pesos = await peso.listarPesos();
  ok('os pesos voltaram', pesos.length, 2);

  /* ================================================================ */
  /* 6. Importar um backup mais pobre avisa em vez de apagar calado    */
  /* ================================================================ */

  const pobre = JSON.parse(json);
  pobre.dados.sessoes = [];
  pobre.dados.series = [];
  const perdas = await backup.perdasAoRestaurar(pobre);
  ok('o app avisa que perderia as sessões', perdas.some((p) => p.includes('3 → 0')), true);

  // Tabela ausente do arquivo não é esvaziada: um backup antigo, de antes
  // de a dieta existir, não tem motivo para apagar a dieta de hoje.
  const antigo = JSON.parse(json);
  delete antigo.dados.alimentos;
  await backup.restaurar(antigo);
  ok(
    'tabela que falta no arquivo fica intacta',
    (await dietaRepo.listarAlimentos()).length,
    antes.dados.alimentos.length
  );

  /* --- backup de versão futura é recusado com explicação ----------- */
  const futuro = JSON.parse(json);
  futuro.versaoDb = 99;
  const recusa = backup.validarBackup(futuro);
  ok('backup de versão futura é recusado', recusa.ok, false);
  ok('e a recusa explica o motivo', recusa.erro.includes('99'), true);

  /* --- arquivo de outro app é recusado ----------------------------- */
  ok('arquivo estranho é recusado', backup.validarBackup({ foo: 1 }).ok, false);
  ok('e null também', backup.validarBackup(null).ok, false);

  await backup.apagarTudo();
  await seed.carregarSeNecessario();
  ok('banco devolvido ao padrão no fim', (await sessoes.historico()).length, 0);

  return log;
})()
`;

const servidor = servir(raiz.replace(/\/$/, ''));
const navegador = await lancarNavegador({
  url: `http://localhost:${servidor.porta}/__vazio`,
  porta: PORTA_DEVTOOLS,
});

let codigoSaida = 1;
let cdp = null;
try {
  cdp = await conectar(PORTA_DEVTOOLS);
  await cdp.enviar('Page.enable');
  await cdp.enviar('Runtime.enable');

  const alvo = `http://localhost:${servidor.porta}/__vazio`;
  for (let i = 0; i < 40; i += 1) {
    const url = await cdp.avaliar('location.href');
    if (url === alvo) break;
    await cdp.enviar('Page.navigate', { url: alvo });
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
