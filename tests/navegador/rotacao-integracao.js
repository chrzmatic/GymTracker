/**
 * Teste de integração da Etapa 3: sugestão do próximo treino e calendário
 * lendo treinos, sessões e configurações do IndexedDB real.
 *
 * Os testes puros de `tests/rotacao.test.js` já cobrem a regra. O que este
 * verifica é a ligação: a sugestão usa a rotação que está gravada (na ordem
 * gravada) e respeita as configurações salvas.
 *
 *   deno run -A tests/navegador/rotacao-integracao.js
 */

import { conectar, lancarNavegador, servir } from './cdp.js';

const raiz = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PORTA_DEVTOOLS = 9228;

const cenario = String.raw`
(async () => {
  const log = [];
  const ok = (nome, real, esperado) =>
    log.push({ nome, passou: JSON.stringify(real) === JSON.stringify(esperado), real, esperado });

  const rotacao = await import('/js/services/rotacao-service.js');
  const treinos = await import('/js/services/treino-service.js');
  const sessoes = await import('/js/services/sessao-service.js');
  const config = await import('/js/data/config-repo.js');

  for (const s of await sessoes.listarSessoes()) await sessoes.apagarSessao(s.id);
  await config.removerConfig('inicioSemana');
  await config.removerConfig('diasParaReiniciarRotacao');

  const lista = await treinos.listarTreinos();
  const [A, B, C] = lista.filter((t) => t.naRotacao);

  /* --- sem histórico --- */
  let s = await rotacao.sugestaoPara('2025-09-08');
  ok('sem histórico, sugere o primeiro da rotação', s.treino.nome, A.nome);
  ok('e diz que é o primeiro', s.motivo, 'primeiro');

  /* --- sequência --- */
  await sessoes.iniciarSessao(A.id, '2025-09-08');
  s = await rotacao.sugestaoPara('2025-09-09');
  ok('depois do primeiro, sugere o segundo', s.treino.nome, B.nome);
  ok('o motivo é a sequência', s.motivo, 'sequencia');
  ok('a explicação cita o último treino', s.explicacao.includes(A.nome), true);

  /* --- extras não avançam a rotação --- */
  const extra = await treinos.criarTreino('Cardio', false);
  await sessoes.iniciarSessao(extra.id, '2025-09-09');
  s = await rotacao.sugestaoPara('2025-09-10');
  ok('um treino extra no meio não muda a sugestão', s.treino.nome, B.nome);

  /* --- reinício: as duas condições --- */
  await sessoes.iniciarSessao(B.id, '2025-09-10'); // quarta
  s = await rotacao.sugestaoPara('2025-09-14'); // domingo, mesma semana
  ok('mesma semana: continua a sequência', s.treino.nome, C.nome);

  s = await rotacao.sugestaoPara('2025-09-15'); // segunda, +5 dias
  ok('semana nova e tempo suficiente: reinicia', s.treino.nome, A.nome);
  ok('o motivo é o reinício', s.motivo, 'reinicio');

  /* --- configuração de X muda o resultado --- */
  await config.salvarConfig('diasParaReiniciarRotacao', 10);
  s = await rotacao.sugestaoPara('2025-09-15');
  ok('com X=10, cinco dias não bastam para reiniciar', s.treino.nome, C.nome);
  await config.salvarConfig('diasParaReiniciarRotacao', 2);

  /* --- reordenar a rotação muda a sugestão na hora --- */
  const naRotacao = async () =>
    (await treinos.listarTreinos()).filter((t) => t.naRotacao).map((t) => t.nome);

  // Rotação A, B, C; o último treino foi o B (10/09), então vem o C.
  ok('antes de reordenar, sugere o seguinte ao B', (await rotacao.sugestaoPara('2025-09-11')).treino.nome, C.nome);

  await treinos.moverTreinoNaLista(C.id, -1);
  ok('subir o C deixa a rotação A, C, B', await naRotacao(), [A.nome, C.nome, B.nome]);
  ok(
    'com o B no fim, o seguinte a ele dá a volta para o A',
    (await rotacao.sugestaoPara('2025-09-11')).treino.nome,
    A.nome
  );

  await treinos.moverTreinoNaLista(C.id, 1);
  ok('descer o C restaura A, B, C', await naRotacao(), [A.nome, B.nome, C.nome]);

  /* --- tirar e devolver um treino da rotação --- */
  await treinos.alternarNaRotacao(B.id);
  ok('tirar o B deixa a rotação A, C', await naRotacao(), [A.nome, C.nome]);
  ok(
    'sem o B na rotação, o último que conta é o A',
    (await rotacao.sugestaoPara('2025-09-11')).treino.nome,
    C.nome
  );

  await treinos.alternarNaRotacao(B.id);
  ok(
    'ao voltar, o treino entra no FIM da rotação, não na posição antiga',
    await naRotacao(),
    [A.nome, C.nome, B.nome]
  );

  await treinos.moverTreinoNaLista(B.id, -1);
  ok('rotação restaurada para A, B, C', await naRotacao(), [A.nome, B.nome, C.nome]);

  /* --- calendário --- */
  const mes = await rotacao.dadosDoMes(2025, 9);
  ok('setembro de 2025 tem 5 linhas na grade', mes.grade.semanas.length, 5);
  ok('o mês tem 3 dias com treino', mes.porData.size, 3);
  ok('o resumo conta as sessões do mês', mes.resumo.total, 3);
  ok(
    'o dia 08/09 traz a sessão do treino A',
    mes.porData.get('2025-09-08').map((x) => x.treinoNome),
    [A.nome]
  );
  ok('um dia sem treino não aparece no mapa', mes.porData.has('2025-09-11'), false);
  ok(
    'a sugestão de um dia futuro sai da mesma grade',
    mes.sugestaoDoDia('2025-09-11').treino.nome,
    C.nome
  );

  /* --- sessão retroativa recalcula tudo --- */
  const antesDoRetro = (await rotacao.sugestaoPara('2025-09-12')).treino.nome;
  await sessoes.iniciarSessao(C.id, '2025-09-11');
  const depoisDoRetro = (await rotacao.sugestaoPara('2025-09-12')).treino.nome;
  ok('antes do registro retroativo', antesDoRetro, C.nome);
  ok('depois dele, a sequência avança', depoisDoRetro, A.nome);

  /* --- limpeza --- */
  await treinos.excluirTreino(extra.id);
  for (const x of await sessoes.listarSessoes()) await sessoes.apagarSessao(x.id);
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
