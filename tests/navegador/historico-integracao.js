/**
 * Histórico: copiar o texto de uma sessão pelo menu e escolher várias para
 * copiar juntas, sempre da mais antiga para a mais nova. Nada é gravado.
 *
 *   deno run -A tests/navegador/historico-integracao.js
 */

import { conectar, lancarNavegador, servir } from './cdp.js';

const raiz = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PORTA_DEVTOOLS = 9237;

/* Roda dentro da página. */
const cenario = String.raw`
(async () => {
  const log = [];
  const ok = (nome, real, esperado) =>
    log.push({ nome, passou: JSON.stringify(real) === JSON.stringify(esperado), real, esperado });

  const nav = await import('/js/navegacao.js');
  const svc = await import('/js/services/sessao-service.js');
  const treinos = await import('/js/data/treinos-repo.js');
  const backup = await import('/js/services/backup-service.js');
  const { resumirSessao, textoParaCopiar, textoDeVariasSessoes } = await import('/js/domain/resumo-sessao.js');
  const { hojeIso, somarDias, formatarLongo } = await import('/js/utils/date.js');

  const conteudo = document.getElementById('conteudo');
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  const esperar = async (condicao, ms = 4000) => {
    for (let t = 0; t < ms; t += 50) {
      try { if (await condicao()) return true; } catch { /* ainda não */ }
      await pausa(50);
    }
    return false;
  };
  const dialogo = () => document.querySelector('dialog.modal[open]');
  const tocarNoDialogo = async (texto) => {
    await esperar(() => dialogo());
    const botao = [...dialogo().querySelectorAll('button')].find((b) => b.textContent.includes(texto));
    if (!botao) throw new Error('sem botão "' + texto + '" no diálogo: ' + dialogo().textContent);
    botao.click();
    await esperar(() => !dialogo() || !dialogo().textContent.includes(texto));
  };
  const telaAtual = () => {
    const pilhas = JSON.parse(localStorage.getItem('gymtracker:navegacao'));
    const p = pilhas.pilhas[pilhas.aba];
    return p[p.length - 1].tela;
  };
  const semCarimbo = (b) => JSON.stringify({ ...b, exportadoEm: null, data: null });

  // Banco limpo de sessões.
  for (const s of await svc.listarSessoes()) await svc.apagarSessao(s.id);

  const todos = await treinos.listarTreinos();
  const treinoA = todos.find((t) => t.nome === 'A') || todos[0];
  const treinoB = todos.find((t) => t.nome === 'B') || todos[1] || todos[0];
  const hoje = hojeIso();

  /** Sessão finalizada com uma série no primeiro exercício. */
  const criar = async (treino, dias, carga, anotacao = '') => {
    const data = somarDias(hoje, dias);
    let s = await svc.iniciarSessao(treino.id, data);
    await svc.adicionarSerie(s, s.itens[0], [], false);
    const [serie] = (await svc.carregarSessao(s.id)).series;
    await svc.atualizarSerie({ ...serie, carga, reps: 10 });
    s = (await svc.carregarSessao(s.id)).sessao;
    if (anotacao) await svc.atualizarSessao({ ...s, anotacao });
    return svc.finalizarSessao((await svc.carregarSessao(s.id)).sessao);
  };
  const s6 = await criar(treinoA, -6, 20, 'primeira');
  const s4 = await criar(treinoB, -4, 30);
  const s2 = await criar(treinoA, -2, 40, 'terceira');
  const textoDe = async (s) => textoParaCopiar(resumirSessao(await svc.carregarSessao(s.id)));
  const titulos = (t) => t.split('\n').filter((l) => l.startsWith('Treino '));

  const backupAntes = await backup.montarBackup();

  // Área de transferência falsa; anota se o diálogo ainda estava aberto (dentro do toque).
  let copiado = null;
  let dentroDoToque = null;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t) => { copiado = t; dentroDoToque = Boolean(dialogo()); } },
  });

  const card = (s) => conteudo.querySelector('.card[data-sessao-id="' + s.id + '"]');
  const menuDe = (s) => card(s).querySelector('.btn-menu-sessao');
  const barra = () => conteudo.querySelector('.barra-selecao');
  const barraVisivel = () => Boolean(barra()) && !barra().classList.contains('oculto');
  const botaoCopiar = () => conteudo.querySelector('[data-acao="copiar-selecao"]');
  const marcadas = () => [...conteudo.querySelectorAll('.card.selecionada')].map((c) => c.dataset.sessaoId);
  const abrirHistorico = async () => {
    await nav.recomecar('treino');
    await nav.abrir('historico');
    await esperar(() => card(s6) && card(s4) && card(s2));
  };

  /* --- menu: copiar o texto de uma sessão --- */
  await abrirHistorico();
  menuDe(s4).click();
  await esperar(() => dialogo());
  const opcoes = [...dialogo().querySelectorAll('li button')].map((b) => b.textContent);
  ok('o menu continua com ver, editar e excluir', [
    opcoes.some((t) => t.startsWith('Ver resumo')),
    opcoes.some((t) => t.startsWith('Editar sessão')),
    opcoes.some((t) => t.startsWith('Excluir sessão')),
  ], [true, true, true]);
  ok('o menu tem copiar texto e selecionar várias', [
    opcoes.includes('Copiar texto'),
    opcoes.includes('Selecionar várias para copiar'),
  ], [true, true]);
  await tocarNoDialogo('Copiar texto');
  await esperar(() => copiado !== null);
  ok('copiar pelo menu copia o mesmo texto do resumo', copiado, await textoDe(s4));
  ok('a cópia acontece dentro do toque, antes do menu fechar', dentroDoToque, true);
  await esperar(() => menuDe(s4).textContent === '✓');
  ok('o botão do menu confirma que copiou', menuDe(s4).textContent, '✓');
  ok('copiar não sai do histórico', telaAtual(), 'historico');
  await esperar(() => menuDe(s4).textContent === '⋯', 4000);
  ok('e depois volta ao normal', menuDe(s4).textContent, '⋯');

  /* --- escolher várias: marcadas fora de ordem, copiadas da mais antiga para a mais nova --- */
  menuDe(s4).click();
  await tocarNoDialogo('Selecionar várias para copiar');
  await esperar(() => barraVisivel());
  ok('selecionar várias mostra a barra e já marca a sessão do menu', [barraVisivel(), marcadas()], [true, [s4.id]]);
  card(s6).click();
  card(s2).click();
  await esperar(() => marcadas().length === 3 && !botaoCopiar().disabled);
  ok('tocar no card marca em vez de abrir', [telaAtual(), marcadas().length], ['historico', 3]);
  ok('a barra conta as selecionadas', barra().querySelector('.barra-selecao-total').textContent, '3 selecionadas');
  copiado = null;
  botaoCopiar().click();
  await esperar(() => copiado !== null);
  ok('o texto vai da mais antiga para a mais nova', titulos(copiado), [
    'Treino ' + treinoA.nome + ' · ' + formatarLongo(s6.data),
    'Treino ' + treinoB.nome + ' · ' + formatarLongo(s4.data),
    'Treino ' + treinoA.nome + ' · ' + formatarLongo(s2.data),
  ]);
  const carregadas = await Promise.all([s2, s4, s6].map((s) => svc.carregarSessao(s.id)));
  ok('o texto de várias é o mesmo da função do domínio', copiado, textoDeVariasSessoes(carregadas));
  ok('cada sessão sai com o texto completo dela', [
    copiado.includes(await textoDe(s6)),
    copiado.includes(await textoDe(s4)),
    copiado.includes(await textoDe(s2)),
  ], [true, true, true]);
  await esperar(() => botaoCopiar().textContent.includes('Copiado'));
  ok('o botão da barra confirma que copiou', botaoCopiar().textContent, 'Copiado ✓');

  /* --- desmarcar, pelo card e pelo botão do canto --- */
  card(s6).click();
  menuDe(s2).click();
  await esperar(() => marcadas().length === 1);
  ok('desmarcar tira da escolha', marcadas(), [s4.id]);
  ok('o botão do canto mostra quem está marcado', [menuDe(s4).textContent, menuDe(s2).textContent], ['✓', '']);
  ok('durante a escolha, o botão do canto não abre o menu', Boolean(dialogo()), false);
  ok('no singular', barra().querySelector('.barra-selecao-total').textContent, '1 selecionada');
  menuDe(s4).click();
  await esperar(() => marcadas().length === 0);
  ok('sem nenhuma marcada, não dá para copiar', botaoCopiar().disabled, true);

  /* --- sem conseguir copiar, mostra o texto para copiar na mão --- */
  card(s2).click();
  card(s6).click();
  await esperar(() => marcadas().length === 2 && !botaoCopiar().disabled);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async () => { throw new Error('negado'); } },
  });
  const execOriginal = document.execCommand.bind(document);
  document.execCommand = () => false;
  botaoCopiar().click();
  await esperar(() => dialogo()?.querySelector('textarea'));
  const carregadas2 = await Promise.all([s2, s6].map((s) => svc.carregarSessao(s.id)));
  ok('sem conseguir copiar, mostra o texto das escolhidas', dialogo()?.querySelector('textarea')?.value, textoDeVariasSessoes(carregadas2));
  await tocarNoDialogo('Fechar');
  document.execCommand = execOriginal;

  /* --- cancelar volta ao normal --- */
  conteudo.querySelector('[data-acao="cancelar-selecao"]').click();
  await esperar(() => !barraVisivel());
  ok('cancelar esconde a barra e desmarca tudo', [barraVisivel(), marcadas()], [false, []]);
  ok('os botões voltam a ser o menu', [menuDe(s6), menuDe(s4), menuDe(s2)].map((b) => b.textContent), ['⋯', '⋯', '⋯']);
  card(s2).click();
  await esperar(() => telaAtual() === 'sessao-resumo');
  ok('depois de cancelar, tocar no card abre o resumo de novo', telaAtual(), 'sessao-resumo');

  /* --- sair da tela e voltar: começa sem escolha --- */
  await abrirHistorico();
  menuDe(s6).click();
  await tocarNoDialogo('Selecionar várias para copiar');
  await esperar(() => barraVisivel());
  await nav.voltarUmaTela();
  await nav.abrir('historico');
  await esperar(() => card(s6));
  ok('voltar ao histórico começa sem escolha', [barraVisivel(), marcadas()], [false, []]);

  /* --- sessão excluída por fora enquanto estava marcada --- */
  const fantasma = await criar(treinoA, -1, 50);
  await abrirHistorico();
  await esperar(() => card(fantasma));
  menuDe(s6).click();
  await tocarNoDialogo('Selecionar várias para copiar');
  await esperar(() => barraVisivel() && !botaoCopiar().disabled);
  await svc.apagarSessao(fantasma.id);
  card(fantasma).click();
  await esperar(() => marcadas().length === 1 && !botaoCopiar().disabled);
  ok('sessão que sumiu do banco não entra na escolha', marcadas(), [s6.id]);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t) => { copiado = t; } },
  });
  copiado = null;
  botaoCopiar().click();
  await esperar(() => copiado !== null);
  ok('e copiar continua funcionando', copiado, await textoDe(s6));

  /* --- nada foi gravado --- */
  ok('copiar e escolher não gravam nada no banco', semCarimbo(await backup.montarBackup()), semCarimbo(backupAntes));
  ok('não ficou mensagem de erro na tela', conteudo.textContent.includes('Erro'), false);

  delete navigator.clipboard;
  for (const s of await svc.listarSessoes()) await svc.apagarSessao(s.id);
  ok('banco limpo ao fim', (await svc.listarSessoes()).length, 0);
  return log;
})()
`;

const servidor = servir(raiz.replace(/\/$/, ''));
const navegador = await lancarNavegador({
  url: `http://localhost:${servidor.porta}/`,
  porta: PORTA_DEVTOOLS,
});

let codigoSaida = 1;
let cdp = null;
try {
  cdp = await conectar(PORTA_DEVTOOLS);
  await cdp.enviar('Page.enable');
  await cdp.enviar('Runtime.enable');

  const alvo = `http://localhost:${servidor.porta}/`;
  for (let i = 0; i < 40; i += 1) {
    const url = await cdp.avaliar('location.href');
    if (url === alvo) break;
    await cdp.enviar('Page.navigate', { url: alvo });
    await new Promise((r) => setTimeout(r, 250));
  }

  // Espera a carga inicial e a primeira tela.
  for (let i = 0; i < 60; i += 1) {
    const pronto = await cdp.avaliar(
      `(async () => { try { const t = await import('/js/data/treinos-repo.js'); return (await t.listarTreinos()).length > 0 && !document.getElementById('conteudo').textContent.includes('Carregando'); } catch { return false; } })()`,
    );
    if (pronto) break;
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
