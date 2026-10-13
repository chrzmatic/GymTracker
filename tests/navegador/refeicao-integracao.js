/**
 * Refeição da dieta, tocando na interface: subir e descer itens e substituir
 * um alimento (ou prato, ou opção de grupo) mantendo a quantidade.
 *
 *   deno run -A tests/navegador/refeicao-integracao.js
 */

import { conectar, lancarNavegador, servir } from './cdp.js';

const raiz = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PORTA_DEVTOOLS = 9238;

/* Roda dentro da página. */
const cenario = String.raw`
(async () => {
  const log = [];
  const ok = (nome, real, esperado) =>
    log.push({ nome, passou: JSON.stringify(real) === JSON.stringify(esperado), real, esperado });

  const nav = await import('/js/navegacao.js');
  const dieta = await import('/js/services/dieta-service.js');
  const backup = await import('/js/services/backup-service.js');
  const { TIPO_ITEM } = await import('/js/domain/nutricao.js');

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
    await esperar(() => dialogo() && [...dialogo().querySelectorAll('button')].some((b) => b.textContent.includes(texto)));
    const botao = [...dialogo().querySelectorAll('button')].find((b) => b.textContent.includes(texto));
    if (!botao) throw new Error('sem botão "' + texto + '" no diálogo: ' + dialogo()?.textContent);
    const antes = dialogo();
    botao.click();
    await esperar(() => dialogo() !== antes);
  };
  const opcoesDoDialogo = async () => {
    await esperar(() => dialogo());
    return [...dialogo().querySelectorAll('li button')].map((b) => b.textContent);
  };

  /* --- refeição de teste, fora de qualquer plano usado no dia --- */
  const PLANO = 'plano-dia-de-treino';
  const planoAntes = (await dieta.buscarPlano(PLANO)).refeicoes.slice();
  const outrasAntes = JSON.stringify(
    (await dieta.listarRefeicoes()).sort((a, b) => a.id.localeCompare(b.id)),
  );
  const ref = await dieta.criarRefeicaoNoPlano(PLANO, 'Teste de troca');
  await dieta.adicionarItem(ref.id, { tipo: TIPO_ITEM.ALIMENTO, alimentoId: 'alim-aveia', quantidade: 20 });
  await dieta.adicionarItem(ref.id, { tipo: TIPO_ITEM.ALIMENTO, alimentoId: 'alim-proteina-em-po', quantidade: 30 });
  await dieta.adicionarItem(ref.id, { tipo: TIPO_ITEM.ALIMENTO, alimentoId: 'alim-leite-integral', quantidade: 300 });
  await dieta.adicionarItem(ref.id, {
    tipo: TIPO_ITEM.GRUPO,
    nome: 'Carbo',
    opcoes: [
      { id: 'op-arroz', tipo: TIPO_ITEM.ALIMENTO, alimentoId: 'alim-arroz-branco', quantidade: 150 },
      { id: 'op-sand', tipo: TIPO_ITEM.PRATO, pratoId: 'prato-sanduiche-com-manteiga', porcoes: 1 },
    ],
    padraoId: 'op-arroz',
  });
  await dieta.adicionarItem(ref.id, { tipo: TIPO_ITEM.PRATO, pratoId: 'prato-sanduiche-sem-manteiga', porcoes: 2 });
  await dieta.adicionarItem(ref.id, { tipo: TIPO_ITEM.LIVRE, texto: 'Salada à vontade' });

  const lerRefeicao = async () => (await dieta.listarRefeicoes()).find((r) => r.id === ref.id);
  const cards = () => [...conteudo.querySelectorAll('.card')].filter((c) => c.querySelector('[aria-label="Opções do item"]'));
  const cardDe = (nome) => cards().find((c) => c.querySelector('h3').textContent === nome);
  const nomesNaTela = () => cards().map((c) => c.querySelector('h3').textContent);
  const abrirRefeicao = async () => {
    await nav.recomecar('dieta');
    await nav.abrir('refeicao', { refeicaoId: ref.id });
    await esperar(() => cards().length === 6);
  };
  const redesenhou = (nomes) => esperar(() => JSON.stringify(nomesNaTela()) === JSON.stringify(nomes));

  await abrirRefeicao();
  const iniciais = (await lerRefeicao()).itens;
  const idsIniciais = iniciais.map((i) => i.id);
  ok('a tela mostra os itens na ordem salva', nomesNaTela(), ['Aveia', 'Proteína em pó', 'Leite integral', 'Carbo', 'Sanduíche sem manteiga', 'Salada à vontade']);

  /* --- setas --- */
  const seta = (card, rotulo) => card.querySelector('[aria-label="' + rotulo + '"]');
  ok('o primeiro não sobe e o último não desce', [
    seta(cards()[0], 'Subir item').disabled,
    seta(cards()[0], 'Descer item').disabled,
    seta(cards()[5], 'Descer item').disabled,
    seta(cards()[5], 'Subir item').disabled,
  ], [true, false, true, false]);
  seta(cardDe('Aveia'), 'Descer item').click();
  await redesenhou(['Proteína em pó', 'Aveia', 'Leite integral', 'Carbo', 'Sanduíche sem manteiga', 'Salada à vontade']);
  ok('descer troca com o de baixo, na tela e no banco', (await lerRefeicao()).itens.map((i) => i.id), [idsIniciais[1], idsIniciais[0], ...idsIniciais.slice(2)]);
  seta(cardDe('Salada à vontade'), 'Subir item').click();
  await redesenhou(['Proteína em pó', 'Aveia', 'Leite integral', 'Carbo', 'Salada à vontade', 'Sanduíche sem manteiga']);
  seta(cardDe('Aveia'), 'Subir item').click();
  await redesenhou(['Aveia', 'Proteína em pó', 'Leite integral', 'Carbo', 'Salada à vontade', 'Sanduíche sem manteiga']);
  ok('mover não muda o conteúdo dos itens, só a ordem', JSON.stringify([...(await lerRefeicao()).itens].sort((a, b) => a.id.localeCompare(b.id))), JSON.stringify([...iniciais].sort((a, b) => a.id.localeCompare(b.id))));

  /* --- menu de cada tipo --- */
  cardDe('Aveia').querySelector('[aria-label="Opções do item"]').click();
  ok('menu de alimento', await opcoesDoDialogo(), ['Substituir por outro alimento20 g', 'Remover']);
  await tocarNoDialogo('Cancelar');
  cardDe('Carbo').querySelector('[aria-label="Opções do item"]').click();
  ok('menu de grupo', await opcoesDoDialogo(), ['Renomear grupo', 'Remover o grupo']);
  await tocarNoDialogo('Cancelar');
  cardDe('Salada à vontade').querySelector('[aria-label="Opções do item"]').click();
  ok('menu de item livre', await opcoesDoDialogo(), ['Remover']);
  await tocarNoDialogo('Cancelar');
  ok('não sobra o × antigo', conteudo.querySelectorAll('[aria-label="Remover item"]').length, 0);

  /* --- substituir: mesma unidade mantém a quantidade sem perguntar --- */
  const idAveia = idsIniciais[0];
  cardDe('Aveia').querySelector('[aria-label="Opções do item"]').click();
  await tocarNoDialogo('Substituir por outro alimento');
  await esperar(() => dialogo()?.querySelector('input[type="search"]'));
  ok('a busca abre com o título do item', dialogo().querySelector('h2').textContent, 'Substituir Aveia');
  await tocarNoDialogo('Pasta de amendoim');
  await redesenhou(['Pasta de amendoim', 'Proteína em pó', 'Leite integral', 'Carbo', 'Salada à vontade', 'Sanduíche sem manteiga']);
  let item = (await lerRefeicao()).itens.find((i) => i.id === idAveia);
  ok('g para g: troca o alimento e mantém 20 g, mesmo id e mesmo lugar', [item.alimentoId, item.quantidade, (await lerRefeicao()).itens[0].id], ['alim-pasta-de-amendoim', 20, idAveia]);
  ok('não abriu pergunta de quantidade', Boolean(dialogo()), false);
  ok('o botão de quantidade mostra 20 g', cardDe('Pasta de amendoim').querySelector('.linha-botoes button').textContent, '20 g');

  /* --- cancelar a busca não muda nada --- */
  const antesDeCancelar = JSON.stringify(await lerRefeicao());
  cardDe('Pasta de amendoim').querySelector('[aria-label="Opções do item"]').click();
  await tocarNoDialogo('Substituir por outro alimento');
  await esperar(() => dialogo()?.querySelector('input[type="search"]'));
  await tocarNoDialogo('Cancelar');
  ok('cancelar a busca não muda nada', JSON.stringify(await lerRefeicao()), antesDeCancelar);

  /* --- unidade diferente: pergunta, já com a quantidade antiga --- */
  cardDe('Proteína em pó').querySelector('[aria-label="Opções do item"]').click();
  await tocarNoDialogo('Substituir por outro alimento');
  await tocarNoDialogo('Leite integral');
  await esperar(() => dialogo()?.querySelector('input[name="q"]'));
  ok('g para ml pergunta a quantidade, preenchida com a antiga', [dialogo().querySelector('label').textContent, dialogo().querySelector('input[name="q"]').value], ['Quantidade (ml)', '30']);
  ok('e explica a troca de unidade', dialogo().textContent.includes('Proteína em pó estava em g; Leite integral é medido em ml.'), true);
  dialogo().querySelector('input[name="q"]').value = '200';
  await tocarNoDialogo('Salvar');
  await esperar(async () => (await lerRefeicao()).itens[1].alimentoId === 'alim-leite-integral');
  item = (await lerRefeicao()).itens[1];
  ok('salva o alimento novo com a quantidade digitada', [item.id, item.alimentoId, item.quantidade], [idsIniciais[1], 'alim-leite-integral', 200]);

  /* --- cancelar a pergunta de quantidade não troca --- */
  const antesDaPergunta = JSON.stringify(await lerRefeicao());
  await esperar(() => cards().length === 6);
  cards()[2].querySelector('[aria-label="Opções do item"]').click();
  await tocarNoDialogo('Substituir por outro alimento');
  await tocarNoDialogo('Aveia');
  await esperar(() => dialogo()?.querySelector('input[name="q"]'));
  await tocarNoDialogo('Cancelar');
  ok('cancelar a quantidade não troca nada', JSON.stringify(await lerRefeicao()), antesDaPergunta);

  /* --- prato troca por prato, mantendo as porções --- */
  cardDe('Sanduíche sem manteiga').querySelector('[aria-label="Opções do item"]').click();
  const opcoesDoPrato = await opcoesDoDialogo();
  ok('menu de prato', opcoesDoPrato, ['Substituir por outro prato2 porções', 'Remover']);
  await tocarNoDialogo('Substituir por outro prato');
  await esperar(() => dialogo()?.querySelector('input[type="search"]'));
  ok('a lista não oferece o próprio prato', [...dialogo().querySelectorAll('li button')].map((b) => b.textContent), ['Sanduíche com manteiga']);
  await tocarNoDialogo('Sanduíche com manteiga');
  await esperar(async () => (await lerRefeicao()).itens[5].pratoId === 'prato-sanduiche-com-manteiga');
  item = (await lerRefeicao()).itens[5];
  ok('prato: troca e mantém 2 porções', [item.id, item.pratoId, item.porcoes], [idsIniciais[4], 'prato-sanduiche-com-manteiga', 2]);

  /* --- opção de grupo --- */
  await esperar(() => cardDe('Carbo')?.querySelectorAll('.linha-opcao').length === 2);
  const linhaArroz = [...cardDe('Carbo').querySelectorAll('.linha-opcao')].find((l) => l.textContent.includes('Arroz'));
  linhaArroz.querySelector('.btn-icone').click();
  ok('menu da opção tem substituir', (await opcoesDoDialogo()).some((t) => t.startsWith('Substituir por outro alimento')), true);
  await tocarNoDialogo('Substituir por outro alimento');
  await tocarNoDialogo('Batata doce assada');
  await esperar(async () => (await lerRefeicao()).itens[3].opcoes[0].alimentoId === 'alim-batata-doce');
  const grupo = (await lerRefeicao()).itens[3];
  ok('opção: troca o alimento, mantém 150, o id e a padrão', [grupo.opcoes[0].id, grupo.opcoes[0].quantidade, grupo.padraoId], ['op-arroz', 150, 'op-arroz']);
  ok('a outra opção do grupo fica igual', grupo.opcoes[1], { id: 'op-sand', tipo: TIPO_ITEM.PRATO, pratoId: 'prato-sanduiche-com-manteiga', porcoes: 1 });
  await esperar(() => cardDe('Carbo')?.querySelectorAll('.linha-opcao').length === 2);
  const linhaSand = [...cardDe('Carbo').querySelectorAll('.linha-opcao')].find((l) => l.textContent.includes('Sanduíche'));
  linhaSand.querySelector('.btn-icone').click();
  ok('opção que é prato oferece outro prato', (await opcoesDoDialogo()).some((t) => t.startsWith('Substituir por outro prato')), true);
  await tocarNoDialogo('Cancelar');

  /* --- renomear grupo e remover pelo menu --- */
  cardDe('Carbo').querySelector('[aria-label="Opções do item"]').click();
  await tocarNoDialogo('Renomear grupo');
  await esperar(() => dialogo()?.querySelector('input[name="nome"]'));
  dialogo().querySelector('input[name="nome"]').value = 'Carboidrato';
  await tocarNoDialogo('Salvar');
  await esperar(() => cardDe('Carboidrato'));
  ok('renomear grupo pelo menu', (await lerRefeicao()).itens[3].nome, 'Carboidrato');
  cardDe('Salada à vontade').querySelector('[aria-label="Opções do item"]').click();
  await tocarNoDialogo('Remover');
  await tocarNoDialogo('Remover');
  await esperar(() => cards().length === 5);
  ok('remover pelo menu tira o item', (await lerRefeicao()).itens.some((i) => i.tipo === TIPO_ITEM.LIVRE), false);

  /* --- os cálculos e o backup enxergam a troca --- */
  const calc = await dieta.calcularRefeicaoPorId(ref.id);
  ok('o cálculo usa o alimento novo, sem erro', [calc.calculo.itens[0].nome, calc.calculo.itens.every((i) => !i.erro)], ['Pasta de amendoim', true]);
  const b = await backup.montarBackup();
  const noBackup = JSON.stringify(b).includes('alim-pasta-de-amendoim') && JSON.stringify(b).includes(ref.id);
  ok('o backup leva a refeição alterada', noBackup, true);
  ok('não ficou mensagem de erro na tela', conteudo.textContent.includes('Erro'), false);

  /* --- limpeza; as outras refeições ficaram intactas --- */
  await dieta.removerRefeicaoDoPlano(PLANO, ref.id);
  ok('a refeição de teste foi apagada', Boolean(await lerRefeicao()), false);
  ok('o plano voltou ao que era', (await dieta.buscarPlano(PLANO)).refeicoes, planoAntes);
  ok('as outras refeições não mudaram', JSON.stringify((await dieta.listarRefeicoes()).sort((a, b) => a.id.localeCompare(b.id))), outrasAntes);
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
