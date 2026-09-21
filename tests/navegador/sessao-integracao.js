/**
 * Teste de integração da sessão de treino, num navegador de verdade.
 *
 * Diferença para `tests/sessao.test.js`: aquele testa as funções puras da
 * camada domain; este sobe o app inteiro (services + IndexedDB + carga
 * inicial) num Edge/Chrome invisível e exercita o mesmo caminho que o dedo
 * percorre na tela.
 *
 * Um comando só, sem instalar nada:
 *   deno run -A tests/navegador/sessao-integracao.js
 */

import { conectar, lancarNavegador, servir } from './cdp.js';

const raiz = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PORTA_DEVTOOLS = 9223;

/* O código abaixo roda dentro da página, não aqui. */
const cenario = String.raw`
(async () => {
  const log = [];
  const ok = (nome, real, esperado) =>
    log.push({ nome, passou: JSON.stringify(real) === JSON.stringify(esperado), real, esperado });

  const svc = await import('/js/services/sessao-service.js');
  const treinos = await import('/js/data/treinos-repo.js');
  const hoje = (await import('/js/utils/date.js')).hojeIso();

  const todos = await treinos.listarTreinos();
  const treinoA = todos.find((t) => t.nome === 'A') || todos[0];

  // Banco limpo: apaga o que sobrou de execuções anteriores.
  for (const s of await svc.listarSessoes()) await svc.apagarSessao(s.id);

  const seriesDoItem = async (sessaoId, itemId) =>
    (await svc.carregarSessao(sessaoId)).series.filter((s) => s.itemId === itemId);
  const resumo = (series) =>
    series.map((s) => (s.aquecimento ? 'aq' : '') + s.numero + ':' + s.carga + 'x' + s.reps);
  const rotulos = (series) => series.map((s) => (s.aquecimento ? 'aq' : 'ok') + s.numero);

  /* --- sessão 1: 14kg x 12 na primeira, 16kg x 8 na segunda --- */
  const s1 = await svc.iniciarSessao(treinoA.id, hoje);
  const item1 = s1.itens[0];

  await svc.adicionarSerie(s1, item1, [], false);
  let series = await seriesDoItem(s1.id, item1.itemId);
  await svc.atualizarSerie({ ...series[0], carga: 14, reps: 12 });

  series = await seriesDoItem(s1.id, item1.itemId);
  await svc.adicionarSerie(s1, item1, series, false);
  series = await seriesDoItem(s1.id, item1.itemId);
  await svc.atualizarSerie({ ...series[1], carga: 16, reps: 8 });

  series = await seriesDoItem(s1.id, item1.itemId);
  ok('sessão 1 grava cada série com seus próprios valores', resumo(series), ['1:14x12', '2:16x8']);
  await svc.finalizarSessao(s1);

  /* --- sessão 2: cada série autocompleta com a série de mesmo número --- */
  let s2 = await svc.iniciarSessao(treinoA.id, hoje);
  const item2 = s2.itens[0];
  let atuais = [];
  for (let i = 0; i < 3; i += 1) {
    await svc.adicionarSerie(s2, item2, atuais, false);
    atuais = await seriesDoItem(s2.id, item2.itemId);
  }
  ok(
    'série 1 vem 14x12, série 2 vem 16x8 (e a 3ª repete a última)',
    resumo(atuais),
    ['1:14x12', '2:16x8', '3:16x8']
  );

  /* --- aquecimento é sempre a primeira, e é categoria à parte --- */
  await svc.adicionarSerie(s2, item2, atuais, true);
  atuais = await seriesDoItem(s2.id, item2.itemId);
  ok('aquecimento adicionado por último aparece em primeiro', rotulos(atuais), ['aq1', 'ok1', 'ok2', 'ok3']);
  ok(
    'aquecimento não herda a carga das séries valendo',
    [atuais[0].carga, atuais[0].reps],
    [null, null]
  );

  const terceira = atuais.find((s) => !s.aquecimento && s.numero === 3);
  await svc.alternarAquecimentoDaSerie(terceira.id, atuais);
  atuais = await seriesDoItem(s2.id, item2.itemId);
  ok('marcar uma série como aquecimento move para o começo e renumera', rotulos(atuais), [
    'aq1',
    'aq2',
    'ok1',
    'ok2',
  ]);

  /* --- reordenar exercícios durante o treino --- */
  const antes = s2.itens.slice().sort((a, b) => a.ordem - b.ordem).map((i) => i.itemId);
  const esperada = [antes[0], antes[2], antes[1], ...antes.slice(3)];
  s2 = await svc.moverItem(s2, antes[2], -1);
  ok(
    'subir um exercício troca a posição dele com o de cima',
    s2.itens.slice().sort((a, b) => a.ordem - b.ordem).map((i) => i.itemId),
    esperada
  );

  const ordens = new Map(s2.itens.map((i) => [i.itemId, i.ordem]));
  const todasSeries = await svc.seriesDaSessao(s2.id);
  ok(
    'as séries acompanham a nova ordem',
    todasSeries.every((s) => s.ordemItem === ordens.get(s.itemId)),
    true
  );

  await svc.finalizarSessao(s2);
  const recarregada = await svc.carregarSessao(s2.id);
  ok(
    'a ordem fica gravada e sobrevive a recarregar o app',
    recarregada.sessao.itens.slice().sort((a, b) => a.ordem - b.ordem).map((i) => i.itemId),
    esperada
  );

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

  // Garante que estamos na página do app, e não na aba inicial em branco.
  const alvo = `http://localhost:${servidor.porta}/`;
  for (let i = 0; i < 40; i += 1) {
    const url = await cdp.avaliar('location.href');
    if (url === alvo) break;
    await cdp.enviar('Page.navigate', { url: alvo });
    await new Promise((r) => setTimeout(r, 250));
  }

  // Espera a carga inicial terminar (o seed roda na primeira abertura).
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
