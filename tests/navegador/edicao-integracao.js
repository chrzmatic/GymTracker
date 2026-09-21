/**
 * Teste de integração da Etapa 2: edição de treinos, exercícios e músculos
 * contra o IndexedDB real.
 *
 *   deno run -A tests/navegador/edicao-integracao.js
 */

import { conectar, lancarNavegador, servir } from './cdp.js';

const raiz = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PORTA_DEVTOOLS = 9225;

const cenario = String.raw`
(async () => {
  const log = [];
  const ok = (nome, real, esperado) =>
    log.push({ nome, passou: JSON.stringify(real) === JSON.stringify(esperado), real, esperado });

  const treinos = await import('/js/services/treino-service.js');
  const exercicios = await import('/js/services/exercicio-service.js');
  const sessoes = await import('/js/services/sessao-service.js');
  const hoje = (await import('/js/utils/date.js')).hojeIso();

  for (const s of await sessoes.listarSessoes()) await sessoes.apagarSessao(s.id);

  /* --- criar e reordenar treinos --- */
  const antes = (await treinos.listarTreinos()).filter((t) => t.naRotacao).map((t) => t.nome);
  const novo = await treinos.criarTreino('D', true);
  let agrupados = await treinos.listarTreinosAgrupados();
  ok('treino novo entra no fim da rotação', agrupados.rotacao.map((t) => t.nome), [...antes, 'D']);

  await treinos.moverTreinoNaLista(novo.id, -1);
  agrupados = await treinos.listarTreinosAgrupados();
  const esperadoAposSubir = [...antes.slice(0, -1), 'D', antes[antes.length - 1]];
  ok('subir um treino reordena a rotação', agrupados.rotacao.map((t) => t.nome), esperadoAposSubir);

  await treinos.alternarNaRotacao(novo.id);
  agrupados = await treinos.listarTreinosAgrupados();
  ok('tirar da rotação move para os extras', agrupados.extras.map((t) => t.nome), ['D']);
  ok('a rotação volta ao que era', agrupados.rotacao.map((t) => t.nome), antes);

  /* --- criar exercício e montar um treino --- */
  const agacho = await exercicios.criar('Agachamento búlgaro', 'carga');
  ok('o ID do exercício vem do nome', agacho.id, 'ex-agachamento-bulgaro');

  let treinoD = (await treinos.buscarTreinoDetalhado(novo.id)).treino;
  treinoD = await treinos.adicionarItem(treinoD, agacho.id);
  const outro = (await exercicios.listarExercicios()).find((e) => e.id !== agacho.id);
  treinoD = await treinos.adicionarItem(treinoD, outro.id);
  ok('os dois exercícios entraram no treino', treinoD.itens.length, 2);
  ok(
    'o app acha em que treino o exercício está',
    (await exercicios.ondeEUsado(agacho.id)).treinos.map((u) => u.treinoNome),
    ['D']
  );

  treinoD = await treinos.alterarItem(treinoD, treinoD.itens[0].id, {
    seriesPlanejadas: 4,
    repsPlanejadas: 10,
    opcional: true,
  });
  const dominio = await import('/js/domain/treino.js');
  ok(
    'séries planejadas somam separando as opcionais',
    dominio.seriesPlanejadasDoTreino(treinoD),
    { obrigatorias: 3, opcionais: 4, total: 7 }
  );

  /* --- grupo de alternativas --- */
  const terceiro = (await exercicios.listarExercicios()).find(
    (e) => e.id !== agacho.id && e.id !== outro.id
  );
  treinoD = await treinos.criarGrupo(treinoD, treinoD.itens[1].id, terceiro.id, 'Um ou outro');
  let grupo = treinoD.itens[1];
  ok('o grupo guarda as duas alternativas', grupo.alternativas, [outro.id, terceiro.id]);
  ok('o exercício original vira o padrão', grupo.exercicioPadraoId, outro.id);

  treinoD = await treinos.tirarAlternativa(treinoD, grupo.id, terceiro.id);
  ok('sobrando uma alternativa, o grupo vira item simples', treinoD.itens[1].tipo, 'exercicio');

  /* --- uma sessão do treino novo usa o modelo editado --- */
  const sessao = await sessoes.iniciarSessao(novo.id, hoje);
  ok('a sessão nasce com os itens do modelo', sessao.itens.length, 2);
  ok('o item opcional chega marcado na sessão', sessao.itens[0].opcional, true);
  ok('as séries planejadas chegam na sessão', sessao.itens[0].seriesPlanejadas, 4);

  /* --- editar o modelo não mexe na sessão já criada --- */
  treinoD = await treinos.removerItem(treinoD, treinoD.itens[0].id);
  const recarregada = await sessoes.carregarSessao(sessao.id);
  ok('remover do modelo não altera a sessão registrada', recarregada.sessao.itens.length, 2);
  ok('o modelo ficou com um item', (await treinos.buscarTreinoDetalhado(novo.id)).treino.itens.length, 1);

  /* --- excluir exercício limpa os treinos e preserva o histórico --- */
  const item = (await treinos.buscarTreinoDetalhado(novo.id)).treino.itens[0];
  await sessoes.adicionarSerie(sessao, sessao.itens[0], [], false);
  const seriesAntes = (await sessoes.seriesDaSessao(sessao.id)).length;

  // O item do agachamento já saiu do modelo acima, então agora ele não está
  // em treino nenhum — mas o histórico dele continua existindo.
  const usoAntes = await exercicios.ondeEUsado(agacho.id);
  ok('tirado do treino, o exercício não aparece mais em uso', usoAntes.treinos, []);

  await exercicios.excluir(agacho.id);
  const treinosDepois = await treinos.listarTreinos();
  ok(
    'o exercício excluído some de todos os treinos',
    dominio.usosDoExercicio(treinosDepois, agacho.id),
    []
  );
  ok(
    'as séries já registradas continuam lá',
    (await sessoes.seriesDaSessao(sessao.id)).length,
    seriesAntes
  );

  /* --- músculos --- */
  const musculo = await exercicios.criarMusculo('Antebraço');
  const alvo = (await exercicios.listarExercicios())[0];
  await exercicios.salvar({
    ...alvo,
    musculos: [...(alvo.musculos ?? []), { musculoId: musculo.id, tipo: 'indireto', fracao: 0.5 }],
  });
  ok(
    'o músculo novo aparece como usado',
    (await exercicios.exerciciosComMusculo(musculo.id)).length,
    1
  );

  await exercicios.excluirMusculo(musculo.id);
  const depois = await exercicios.buscarExercicio(alvo.id);
  ok(
    'excluir o músculo o tira dos exercícios',
    (depois.musculos ?? []).some((m) => m.musculoId === musculo.id),
    false
  );

  /* --- histórico --- */
  const hist = await sessoes.historico();
  ok('o histórico lista a sessão com o resumo', hist.length, 1);
  ok('o resumo conta as séries registradas', hist[0].series, seriesAntes);

  /* --- limpeza: tira o treino D que este teste criou --- */
  await treinos.excluirTreino(novo.id);
  ok(
    'excluir o treino não apaga a sessão dele',
    (await sessoes.listarSessoes()).length,
    1
  );
  ok('a ordem dos treinos fica sem buraco', (await treinos.listarTreinos()).map((t) => t.ordem), [0, 1, 2]);
  ok('item usado no teste tinha ID', Boolean(item && item.id), true);

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
