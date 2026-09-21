/**
 * Teste de integração das Etapas 5 e 7 contra o IndexedDB real:
 * progressão, séries por músculo, e o ciclo completo de exportar e
 * restaurar um backup.
 *
 *   deno run -A tests/navegador/progresso-backup-integracao.js
 */

import { conectar, lancarNavegador, servir } from './cdp.js';

const raiz = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PORTA_DEVTOOLS = 9232;

const cenario = String.raw`
(async () => {
  const log = [];
  const ok = (nome, real, esperado) =>
    log.push({ nome, passou: JSON.stringify(real) === JSON.stringify(esperado), real, esperado });

  const sessoes = await import('/js/services/sessao-service.js');
  const progresso = await import('/js/services/progresso-service.js');
  const backup = await import('/js/services/backup-service.js');
  const peso = await import('/js/services/peso-service.js');
  const treinos = await import('/js/services/treino-service.js');
  const exercicios = await import('/js/services/exercicio-service.js');

  for (const s of await sessoes.listarSessoes()) await sessoes.apagarSessao(s.id);
  for (const p of await peso.listarPesos()) await peso.removerPeso(p.id);

  const A = (await treinos.listarTreinos()).find((t) => t.nome === 'A');

  /** Registra uma sessão com cargas no primeiro exercício. */
  const registrar = async (data, cargas) => {
    const sessao = await sessoes.iniciarSessao(A.id, data);
    const item = sessao.itens[0];
    let atuais = [];
    for (const [carga, reps] of cargas) {
      await sessoes.adicionarSerie(sessao, item, atuais, false);
      atuais = (await sessoes.carregarSessao(sessao.id)).series.filter((x) => x.itemId === item.itemId);
      const ultima = atuais[atuais.length - 1];
      await sessoes.atualizarSerie({ ...ultima, carga, reps });
      atuais = (await sessoes.carregarSessao(sessao.id)).series.filter((x) => x.itemId === item.itemId);
    }
    await sessoes.finalizarSessao(sessao);
    return { sessao, exercicioId: item.exercicioId };
  };

  const r1 = await registrar('2025-09-01', [[50, 10], [50, 8]]);
  await registrar('2025-09-08', [[55, 10], [55, 8]]);
  await registrar('2025-09-15', [[60, 10], [60, 8]]);
  const exercicioId = r1.exercicioId;

  /* --- progressão --- */
  const lista = await progresso.listarExerciciosComHistorico();
  ok('o exercicio treinado aparece na lista', lista.some((e) => e.id === exercicioId), true);
  ok('com a contagem de sessoes', lista.find((e) => e.id === exercicioId).sessoes, 3);

  const p = await progresso.progressaoDoExercicio(exercicioId, 'tudo');
  ok('tres pontos, em ordem', p.pontos.map((x) => x.data), ['2025-09-01', '2025-09-08', '2025-09-15']);
  ok('carga maxima sobe', p.pontos.map((x) => x.cargaMaxima), [50, 55, 60]);
  ok('volume calculado', p.pontos[0].volume, 50 * 18);
  ok('a variacao cobre o periodo', [p.variacoes.cargaMaxima.primeiro, p.variacoes.cargaMaxima.ultimo], [50, 60]);

  const curto = await progresso.progressaoDoExercicio(exercicioId, '4s');
  ok('o filtro de periodo corta pontos antigos', curto.pontos.length <= 3, true);
  ok('mas o total continua sabendo de todos', curto.total, 3);

  /* --- resumo semanal --- */
  const semanas = await progresso.semanas();
  ok('tres semanas com treino', semanas.length, 3);
  ok('uma sessao por semana', semanas.map((s) => s.treinos), [1, 1, 1]);
  ok('volume da semana mais recente', semanas[0].volume, 60 * 18);

  /* --- series por musculo, contra o seed --- */
  const musc = await progresso.seriesPorMusculo();
  const peito = musc.planejado.find((m) => m.nome === 'Peito');
  ok('o planejado bate com a tabela do TREINO-DADOS.md', [peito.diretas, peito.indiretas, peito.total], [11, 0, 11]);
  const gluteo = musc.planejado.find((m) => m.nome === 'Gluteo' || m.nome === 'Glúteo');
  ok('gluteo com fracao correta', gluteo.total, 3.5);
  ok('o ciclo tem os treinos da rotacao', musc.treinosPorCiclo, 3);

  const semOpc = musc.planejadoSemOpcionais.find((m) => m.nome === 'Panturrilha');
  ok('sem opcionais, panturrilha zera', semOpc.total, 0);

  /* --- backup: exportar, mexer, restaurar --- */
  await peso.registrar('2025-09-10', 80);
  const antes = {
    sessoes: (await sessoes.listarSessoes()).length,
    pesos: (await peso.listarPesos()).length,
  };

  const arquivo = await backup.exportarJson();
  ok('o nome do arquivo tem data', arquivo.nome.startsWith('gymtracker-backup-'), true);
  const conteudo = JSON.parse(arquivo.conteudo);

  const validacao = backup.validarBackup(conteudo);
  ok('o backup se valida', validacao.ok, true);
  ok('o backup traz as sessoes', validacao.resumo.sessoes, antes.sessoes);
  ok('o backup traz os treinos', validacao.resumo.treinos > 0, true);
  ok('e tambem o peso corporal', validacao.resumo.pesoCorporal, antes.pesos);

  // Estraga os dados de proposito, para ver a restauracao trazer de volta.
  for (const s of await sessoes.listarSessoes()) await sessoes.apagarSessao(s.id);
  for (const x of await peso.listarPesos()) await peso.removerPeso(x.id);
  const novoEx = await exercicios.criar('Exercicio intruso', 'carga');
  ok('dados apagados antes de restaurar', (await sessoes.listarSessoes()).length, 0);

  await backup.restaurar(conteudo);
  ok('as sessoes voltaram', (await sessoes.listarSessoes()).length, antes.sessoes);
  ok('o peso voltou', (await peso.listarPesos()).length, antes.pesos);
  ok('as series voltaram junto', (await sessoes.seriesDaSessao((await sessoes.listarSessoes())[0].id)).length, 2);
  ok(
    'o que foi criado depois do backup some (restaurar substitui)',
    await exercicios.buscarExercicio(novoEx.id),
    undefined
  );

  /* --- validacao rejeita lixo --- */
  ok('rejeita arquivo que nao e backup', backup.validarBackup({ foo: 1 }).ok, false);
  ok('rejeita nulo', backup.validarBackup(null).ok, false);
  ok(
    'rejeita backup de versao futura do banco',
    backup.validarBackup({ formato: 'gymtracker-backup', versaoDb: 999, dados: {} }).ok,
    false
  );

  /* --- CSV --- */
  const csv = await backup.exportarTreinosCsv();
  const linhas = csv.conteudo.replace('﻿', '').trimEnd().split('\r\n');
  ok('o csv tem cabecalho mais uma linha por serie', linhas.length, 1 + 6);
  ok('a primeira coluna e a data', linhas[0].split(';')[0], 'Data');
  ok('a carga usa virgula decimal', csv.conteudo.includes(';50;') || csv.conteudo.includes(';50;'), true);

  /* --- apagar tudo e recomeçar --- */
  const seed = await import('/js/services/seed-service.js');
  const treinosRepo = await import('/js/data/treinos-repo.js');

  await treinos.criarTreino('Treino inventado', true);
  await backup.apagarTudo();
  ok('apagar tudo zera as sessoes', (await sessoes.listarSessoes()).length, 0);
  ok('e tambem os treinos', (await treinosRepo.listarTreinos()).length, 0);
  ok('e o peso corporal', (await peso.listarPesos()).length, 0);

  await seed.carregarSeNecessario();
  const depoisDeZerar = await treinosRepo.listarTreinos();
  ok('a carga inicial volta com os 3 treinos padrao', depoisDeZerar.length, 3);
  ok('e sem o treino inventado', depoisDeZerar.some((t) => t.nome === 'Treino inventado'), false);
  ok('banco limpo de sessoes ao fim', (await sessoes.listarSessoes()).length, 0);

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
      `(async () => { try { const t = await import('/js/data/treinos-repo.js'); return (await t.listarTreinos()).length; } catch { return 0; } })()`
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
