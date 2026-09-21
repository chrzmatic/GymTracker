/**
 * Teste de integração da Etapa 4: comparação entre sessões e peso corporal
 * contra o IndexedDB real.
 *
 * As regras puras já estão cobertas em `tests/metricas.test.js` e
 * `tests/comparacao.test.js`. O que este teste verifica é a ligação: o peso
 * corporal certo para cada data, a normalização da ordem das sessões e os
 * atalhos de escolha.
 *
 *   deno run -A tests/navegador/comparacao-integracao.js
 */

import { conectar, lancarNavegador, servir } from './cdp.js';

const raiz = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PORTA_DEVTOOLS = 9229;

const cenario = String.raw`
(async () => {
  const log = [];
  const ok = (nome, real, esperado) =>
    log.push({ nome, passou: JSON.stringify(real) === JSON.stringify(esperado), real, esperado });

  const sessoes = await import('/js/services/sessao-service.js');
  const comparacao = await import('/js/services/comparacao-service.js');
  const peso = await import('/js/services/peso-service.js');
  const exercicios = await import('/js/services/exercicio-service.js');
  const treinos = await import('/js/services/treino-service.js');

  for (const s of await sessoes.listarSessoes()) await sessoes.apagarSessao(s.id);
  for (const p of await peso.listarPesos()) await peso.removerPeso(p.id);

  const A = (await treinos.listarTreinos()).find((t) => t.nome === 'A');

  /** Registra uma sessão inteira: [[carga, reps], ...] por item. */
  const registrar = async (treinoId, data, porItem) => {
    const sessao = await sessoes.iniciarSessao(treinoId, data);
    for (let i = 0; i < porItem.length; i += 1) {
      const item = sessao.itens[i];
      if (!item) break;
      let atuais = [];
      for (const [carga, reps] of porItem[i]) {
        await sessoes.adicionarSerie(sessao, item, atuais, false);
        atuais = (await sessoes.carregarSessao(sessao.id)).series.filter(
          (x) => x.itemId === item.itemId
        );
        const ultima = atuais[atuais.length - 1];
        await sessoes.atualizarSerie({ ...ultima, carga, reps });
        atuais = (await sessoes.carregarSessao(sessao.id)).series.filter(
          (x) => x.itemId === item.itemId
        );
      }
    }
    await sessoes.finalizarSessao(sessao);
    return sessao;
  };

  /* --- duas sessões do mesmo treino, com progresso --- */
  const antiga = await registrar(A.id, '2025-09-01', [[[50, 10], [50, 8]]]);
  const nova = await registrar(A.id, '2025-09-08', [[[55, 10], [55, 8]]]);

  let r = await comparacao.comparar(antiga.id, nova.id);
  ok('a sessão mais antiga vira o "antes"', r.sessaoA.data, '2025-09-01');
  ok('a mais nova vira o "depois"', r.sessaoB.data, '2025-09-08');

  const achar = (res, nome) => res.itens.find((i) => i.nome === nome);
  const metrica = (item, rotulo) => item.metricas.find((m) => m.rotulo === rotulo);
  const primeiro = r.itens[0];
  ok('carga máxima subiu', [metrica(primeiro, 'Carga máxima').antes, metrica(primeiro, 'Carga máxima').depois], [50, 55]);
  ok('a direção é melhora', metrica(primeiro, 'Carga máxima').direcao, 'melhora');
  ok('volume subiu', metrica(primeiro, 'Volume').depois, 55 * 18);

  /* --- a ordem dos argumentos não importa --- */
  const invertida = await comparacao.comparar(nova.id, antiga.id);
  ok('inverter a ordem não muda o resultado', invertida.sessaoA.data, '2025-09-01');

  /* --- total da sessão --- */
  const volumeTotal = r.total.metricas.find((m) => m.rotulo === 'Volume');
  ok('o total tem volume nas duas sessões', [volumeTotal.antes > 0, volumeTotal.depois > 0], [true, true]);

  /* --- atalho da última sessão do mesmo treino --- */
  const anterior = await comparacao.anteriorDoMesmoTreino(nova);
  ok('o atalho acha a sessão anterior do mesmo treino', anterior.id, antiga.id);
  ok('a sessão mais antiga não tem anterior', await comparacao.anteriorDoMesmoTreino(antiga), null);

  const sugestao = await comparacao.sugestaoDeComparacao();
  ok('a sugestão da tela é o par mais recente', [sugestao.a.id, sugestao.b.id], [antiga.id, nova.id]);

  /* --- peso corporal por data --- */
  await peso.registrar('2025-08-01', 82);
  await peso.registrar('2025-09-05', 80);
  ok('peso antes do primeiro registro é desconhecido', await peso.pesoEm('2025-07-01'), null);
  ok('peso em 01/09 é o de agosto', await peso.pesoEm('2025-09-01'), 82);
  ok('peso em 08/09 é o de 05/09', await peso.pesoEm('2025-09-08'), 80);
  ok('gravar de novo na mesma data substitui', (await peso.registrar('2025-09-05', 79)) && (await peso.listarPesos()).length, 2);
  ok('o resumo traz a variação', (await peso.resumo()).variacao, 79 - 82);

  /* --- exercício assistido usa a carga efetiva de cada data --- */
  const assistido = await exercicios.criar('Barra assistida teste', 'assistido');
  let treinoB = (await treinos.buscarTreinoDetalhado(A.id)).treino;
  treinoB = await treinos.adicionarItem(treinoB, assistido.id);

  const s1 = await registrar(A.id, '2025-09-20', []);
  const s2 = await registrar(A.id, '2025-09-27', []);
  const itemAssist1 = s1.itens[s1.itens.length - 1];
  const itemAssist2 = s2.itens[s2.itens.length - 1];

  await sessoes.adicionarSerie(s1, itemAssist1, [], false);
  let sAtual = (await sessoes.carregarSessao(s1.id)).series.filter((x) => x.itemId === itemAssist1.itemId);
  await sessoes.atualizarSerie({ ...sAtual[0], carga: 30, reps: 8 });

  await sessoes.adicionarSerie(s2, itemAssist2, [], false);
  sAtual = (await sessoes.carregarSessao(s2.id)).series.filter((x) => x.itemId === itemAssist2.itemId);
  await sessoes.atualizarSerie({ ...sAtual[0], carga: 20, reps: 8 });

  await peso.registrar('2025-09-19', 80);
  r = await comparacao.comparar(s1.id, s2.id);
  const assist = achar(r, 'Barra assistida teste');
  ok('assistido compara pela carga efetiva', [metrica(assist, 'Carga máxima').antes, metrica(assist, 'Carga máxima').depois], [50, 60]);
  ok('menos assistência conta como melhora', metrica(assist, 'Carga máxima').direcao, 'melhora');
  ok('não falta peso corporal', r.semPesoCorporal, false);

  /* --- sem peso corporal na data, cai no modo reduzido --- */
  for (const p of await peso.listarPesos()) await peso.removerPeso(p.id);
  r = await comparacao.comparar(s1.id, s2.id);
  const semPeso = achar(r, 'Barra assistida teste');
  ok('sem peso, sobra assistência e reps', semPeso.metricas.map((m) => m.rotulo), ['Séries', 'Reps totais', 'Assistência']);
  ok('e a assistência menor é melhora', semPeso.metricas.find((m) => m.rotulo === 'Assistência').direcao, 'melhora');
  ok('o aviso de peso corporal sobe', r.semPesoCorporal, true);

  /* --- limpeza --- */
  await exercicios.excluir(assistido.id);
  for (const s of await sessoes.listarSessoes()) await sessoes.apagarSessao(s.id);
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
