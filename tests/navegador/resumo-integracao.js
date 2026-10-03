/**
 * Telas novas, tocando na interface: resumo da sessão e copiar, edição
 * refletindo no resumo, exclusão, calendário, histórico, comparar, dieta (kcal,
 * prato incompleto, kJ), versão e backup.
 *
 *   deno run -A tests/navegador/resumo-integracao.js
 */

import { conectar, lancarNavegador, servir } from './cdp.js';

const raiz = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PORTA_DEVTOOLS = 9236;

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
  const dietaRepo = await import('/js/data/dieta-repo.js');
  const dieta = await import('/js/services/dieta-service.js');
  const { resumirSessao, textoParaCopiar } = await import('/js/domain/resumo-sessao.js');
  const { hojeIso, somarDias, formatarLongo } = await import('/js/utils/date.js');
  const { num } = await import('/js/utils/format.js');

  const conteudo = document.getElementById('conteudo');
  const titulo = () => document.getElementById('titulo').textContent;
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
  const botaoComTexto = (texto, dentro = conteudo) =>
    [...dentro.querySelectorAll('button')].find((b) => b.textContent.trim() === texto);
  const seriesNaTela = () => [...conteudo.querySelectorAll('.resumo-serie')].map((e) => e.textContent);
  const topoDaPilha = () => {
    const pilhas = JSON.parse(localStorage.getItem('gymtracker:navegacao'));
    const p = pilhas.pilhas[pilhas.aba];
    return p[p.length - 1];
  };
  const telaAtual = () => topoDaPilha().tela;

  // Banco limpo de sessões.
  for (const s of await svc.listarSessoes()) await svc.apagarSessao(s.id);

  const todos = await treinos.listarTreinos();
  const treinoA = todos.find((t) => t.nome === 'A') || todos[0];
  const hoje = hojeIso();
  const ontem = somarDias(hoje, -1);

  /* --- uma sessão finalizada com séries --- */
  let sessao = await svc.iniciarSessao(treinoA.id, ontem);
  const item = sessao.itens[0];
  await svc.adicionarSerie(sessao, item, [], true);
  let doItem = (await svc.carregarSessao(sessao.id)).series;
  await svc.atualizarSerie({ ...doItem[0], carga: 10, reps: 12 });
  doItem = (await svc.carregarSessao(sessao.id)).series;
  await svc.adicionarSerie(sessao, item, doItem, false);
  doItem = (await svc.carregarSessao(sessao.id)).series;
  const valendo = doItem.find((s) => !s.aquecimento);
  await svc.atualizarSerie({ ...valendo, carga: 16, reps: 10 });
  sessao = await svc.finalizarSessao((await svc.carregarSessao(sessao.id)).sessao);

  const backupAntes = await backup.montarBackup();

  /* --- resumo pela navegação --- */
  await nav.irParaAba('calendario');
  await nav.abrir('sessao-resumo', { sessaoId: sessao.id });
  await esperar(() => conteudo.querySelector('.resumo-sessao'));
  ok('o resumo abre com o nome do treino no título', titulo(), 'Treino ' + treinoA.nome);
  ok('o resumo mostra aquecimento e série', seriesNaTela(), ['aq 10 kg × 12', '16 kg × 10']);
  ok('o resumo não tem campo editável', conteudo.querySelectorAll('input, textarea').length, 0);
  ok('o resumo tem os botões copiar e editar', [
    Boolean(conteudo.querySelector('[data-acao="copiar"]')),
    Boolean(conteudo.querySelector('[data-acao="editar"]')),
  ], [true, true]);

  /* --- copiar: com a API moderna --- */
  let copiado = null;
  const clipboardOriginal = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (t) => { copiado = t; } },
  });
  conteudo.querySelector('[data-acao="copiar"]').click();
  await esperar(() => copiado !== null);
  const carregada = await svc.carregarSessao(sessao.id);
  ok('o texto copiado é o do resumo', copiado, textoParaCopiar(resumirSessao(carregada)));
  ok('o texto copiado tem a data e as séries', [
    copiado.startsWith('Treino ' + treinoA.nome + ' · ' + formatarLongo(ontem)),
    copiado.includes('- aq: 10 kg × 12'),
    copiado.includes('- 16 kg × 10'),
  ], [true, true, true]);
  await esperar(() => conteudo.querySelector('[data-acao="copiar"]').textContent.includes('Copiado'));
  ok('o botão confirma que copiou', conteudo.querySelector('[data-acao="copiar"]').textContent, 'Copiado ✓');

  /* --- copiar: a API moderna falha e o plano B entra --- */
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async () => { throw new Error('negado'); } },
  });
  const execOriginal = document.execCommand.bind(document);
  let viaExec = null;
  document.execCommand = (cmd) => {
    if (cmd === 'copy') { viaExec = document.activeElement?.value ?? window.getSelection().toString(); return true; }
    return execOriginal(cmd);
  };
  conteudo.querySelector('[data-acao="copiar"]').click();
  await esperar(() => viaExec !== null);
  ok('o plano B copia o mesmo texto', viaExec, textoParaCopiar(resumirSessao(carregada)));
  ok('o plano B não deixa textarea sobrando', document.body.querySelectorAll('body > textarea').length, 0);

  /* --- copiar: nada funciona, o texto aparece para copiar na mão --- */
  document.execCommand = () => false;
  conteudo.querySelector('[data-acao="copiar"]').click();
  await esperar(() => dialogo());
  ok('sem conseguir copiar, mostra o texto selecionável', dialogo()?.querySelector('textarea')?.value, textoParaCopiar(resumirSessao(carregada)));
  await tocarNoDialogo('Fechar');
  document.execCommand = execOriginal;
  if (clipboardOriginal) delete navigator.clipboard;

  /* --- editar pela tela de registro e voltar: o resumo reflete --- */
  conteudo.querySelector('[data-acao="editar"]').click();
  await esperar(() => conteudo.querySelector('.serie input'));
  ok('Editar abre a tela de registro', telaAtual(), 'treino');
  const linhaValendo = [...conteudo.querySelectorAll('.serie')].find((l) => !l.classList.contains('aquecimento'));
  const [campoCarga, campoReps] = linhaValendo.querySelectorAll('input');
  campoCarga.value = '17,5';
  campoCarga.dispatchEvent(new Event('blur'));
  campoReps.value = '8';
  campoReps.dispatchEvent(new Event('blur'));
  await esperar(async () => {
    const s = (await svc.carregarSessao(sessao.id)).series.find((x) => !x.aquecimento);
    return s.carga === 17.5 && s.reps === 8;
  });
  document.getElementById('btn-voltar').click();
  await esperar(() => conteudo.querySelector('.resumo-sessao'));
  ok('ao voltar da edição o resumo já mostra o valor novo', seriesNaTela(), ['aq 10 kg × 12', '17,5 kg × 8']);

  /* --- recarregar (voltar do segundo plano) também relê --- */
  const s2 = (await svc.carregarSessao(sessao.id)).series.find((x) => !x.aquecimento);
  await svc.atualizarSerie({ ...s2, reps: 9 });
  await nav.recarregar();
  await esperar(() => seriesNaTela().includes('17,5 kg × 9'));
  ok('alteração feita por fora aparece ao redesenhar', seriesNaTela(), ['aq 10 kg × 12', '17,5 kg × 9']);

  /* --- anotação da sessão aparece no resumo --- */
  await svc.atualizarSessao({ ...(await svc.carregarSessao(sessao.id)).sessao, anotacao: 'Treino bom' });
  await nav.recarregar();
  await esperar(() => conteudo.querySelector('.resumo-anotacao'));
  ok('a anotação aparece no resumo', conteudo.querySelector('.resumo-anotacao')?.textContent, 'Treino bom');

  /* --- ver o resumo não grava nada (o backup fica igual) --- */
  const semCarimbo = (b) => JSON.stringify({ ...b, exportadoEm: null, data: null });
  const backupDepois = await backup.montarBackup();
  ok('o backup só muda pelo que foi editado (contagem de séries igual)',
    backup.descreverBackup(backupDepois), backup.descreverBackup(backupAntes));
  const b1 = await backup.montarBackup();
  await nav.recarregar();
  await esperar(() => conteudo.querySelector('.resumo-sessao'));
  ok('abrir e redesenhar o resumo não grava nada no banco', semCarimbo(await backup.montarBackup()), semCarimbo(b1));

  /* --- restaurar o backup e o resumo continua igual --- */
  const textoAntesDaRestauracao = textoParaCopiar(resumirSessao(await svc.carregarSessao(sessao.id)));
  await backup.restaurar(JSON.parse(JSON.stringify(b1)));
  ok('restaurar o backup confere', await backup.conferirRestauracao(b1), []);
  ok('depois de restaurar, o resumo é o mesmo',
    textoParaCopiar(resumirSessao(await svc.carregarSessao(sessao.id))), textoAntesDaRestauracao);

  /* --- calendário: tocar no dia abre o resumo --- */
  await nav.recomecar('calendario');
  await esperar(() => conteudo.querySelector('.calendario'));
  const celula = [...conteudo.querySelectorAll('.calendario-dia')]
    .find((b) => b.getAttribute('aria-label').startsWith(formatarLongo(ontem)) && !b.classList.contains('fora-do-mes'))
    || [...conteudo.querySelectorAll('.calendario-dia')].find((b) => b.getAttribute('aria-label').startsWith(formatarLongo(ontem)));
  if (!celula) {
    // Ontem é de outro mês (dia 1º): volta um mês.
    conteudo.querySelector('[aria-label="Mês anterior"]').click();
    await pausa(300);
  }
  const celulaOk = [...conteudo.querySelectorAll('.calendario-dia')]
    .find((b) => b.getAttribute('aria-label').startsWith(formatarLongo(ontem)));
  celulaOk.click();
  await esperar(() => dialogo());
  const opcoesDoDia = [...dialogo().querySelectorAll('li button')].map((b) => b.textContent);
  ok('o dia com treino oferece ver o treino', opcoesDoDia.some((t) => t.startsWith('Ver treino ' + treinoA.nome)), true);
  ok('o dia com treino ainda deixa registrar outro', opcoesDoDia.some((t) => t.startsWith('Registrar outro treino')), true);
  await tocarNoDialogo('Ver treino ' + treinoA.nome);
  await esperar(() => conteudo.querySelector('.resumo-sessao'));
  ok('no calendário, ver o treino abre o resumo', telaAtual(), 'sessao-resumo');

  /* --- excluir a sessão pela edição: não sobra tela quebrada --- */
  const descartavel = await svc.iniciarSessao(treinoA.id, ontem);
  await svc.finalizarSessao(descartavel);
  await nav.abrir('sessao-resumo', { sessaoId: descartavel.id });
  await esperar(() => conteudo.querySelector('.resumo-sessao'));
  ok('sessão sem séries mostra os exercícios como não feitos',
    [...conteudo.querySelectorAll('.resumo-exercicio')].every((e) => e.textContent.includes('não feito')), true);
  conteudo.querySelector('[data-acao="editar"]').click();
  await esperar(() => botaoComTexto('Excluir sessão'));
  botaoComTexto('Excluir sessão').click();
  await tocarNoDialogo('Excluir');
  // Pilha: calendário → resumo da outra sessão → resumo desta → registro.
  // Excluir pula o resumo desta e cai no anterior.
  await esperar(() => telaAtual() === 'sessao-resumo' && topoDaPilha().params.sessaoId === sessao.id);
  await pausa(200);
  ok('excluir pela edição pula o resumo da sessão apagada', [telaAtual(), topoDaPilha().params.sessaoId], ['sessao-resumo', sessao.id]);
  ok('e a tela mostra a sessão que sobrou', seriesNaTela(), ['aq 10 kg × 12', '17,5 kg × 9']);
  ok('a sessão excluída sumiu do banco', await svc.carregarSessao(descartavel.id), null);
  ok('a outra sessão continua lá', Boolean(await svc.carregarSessao(sessao.id)), true);
  ok('não ficou mensagem de erro na tela', conteudo.textContent.includes('Erro'), false);

  /* --- sessão excluída por fora: o resumo não quebra --- */
  const fantasma = await svc.iniciarSessao(treinoA.id, ontem);
  await svc.finalizarSessao(fantasma);
  await nav.abrir('sessao-resumo', { sessaoId: fantasma.id });
  await esperar(() => conteudo.querySelector('.resumo-sessao'));
  await svc.apagarSessao(fantasma.id);
  await nav.recarregar();
  await pausa(200);
  ok('resumo de sessão apagada volta uma tela em vez de quebrar', topoDaPilha().params.sessaoId, sessao.id);
  ok('e não sobra tela vazia', Boolean(conteudo.querySelector('.resumo-sessao')), true);

  /* --- histórico: finalizada abre o resumo; em andamento, o registro --- */
  await nav.recomecar('treino');
  await nav.abrir('historico');
  await esperar(() => conteudo.querySelector('.card-clicavel'));
  conteudo.querySelector('.card-clicavel').click();
  await esperar(() => telaAtual() === 'sessao-resumo');
  ok('no histórico, tocar numa sessão finalizada abre o resumo', telaAtual(), 'sessao-resumo');
  await nav.voltarUmaTela();
  await esperar(() => conteudo.querySelector('.card-clicavel'));
  conteudo.querySelector('.card-clicavel .btn-icone').click();
  await esperar(() => dialogo());
  const opcoesHist = [...dialogo().querySelectorAll('li button')].map((b) => b.textContent);
  ok('o menu do histórico tem ver e editar', [opcoesHist.some((t) => t.startsWith('Ver resumo')), opcoesHist.some((t) => t.startsWith('Editar sessão'))], [true, true]);
  await tocarNoDialogo('Editar sessão');
  await esperar(() => telaAtual() === 'treino');
  ok('Editar sessão no histórico abre o registro', telaAtual(), 'treino');

  const aberta = await svc.iniciarSessao(treinoA.id, hoje);
  await nav.recomecar('treino');
  await nav.abrir('historico');
  await esperar(() => conteudo.querySelector('.card-clicavel'));
  const cardAberta = [...conteudo.querySelectorAll('.card-clicavel')].find((c) => c.textContent.includes('em andamento'));
  cardAberta.click();
  await esperar(() => telaAtual() === 'treino');
  ok('no histórico, sessão em andamento abre direto no registro', telaAtual(), 'treino');
  await svc.apagarSessao(aberta.id);

  /* --- comparar: tocar nas caixas troca as sessões --- */
  const s3 = await svc.iniciarSessao(treinoA.id, somarDias(hoje, -3));
  await svc.finalizarSessao(s3);
  const s4 = await svc.iniciarSessao(treinoA.id, somarDias(hoje, -2));
  await svc.finalizarSessao(s4);
  await nav.recomecar('comparar');
  await esperar(() => conteudo.querySelector('.comparar-lado'));
  const caixa = (lado) => conteudo.querySelector('.comparar-lado[data-lado="' + lado + '"]');
  ok('as duas caixas aparecem', [Boolean(caixa('idA')), Boolean(caixa('idB'))], [true, true]);
  ok('não há mais os botões "Trocar" no fim da tela', Boolean(botaoComTexto('Trocar "antes"')), false);
  const depoisAntes = caixa('idB').textContent;
  caixa('idA').click();
  await esperar(() => dialogo());
  const opcoesA = [...dialogo().querySelectorAll('li button')].map((b) => b.textContent);
  ok('a lista do "antes" marca a atual e não oferece a do "depois"', [opcoesA.some((t) => t.includes('atual')), opcoesA.length], [true, 2]);
  await tocarNoDialogo(formatarLongo(somarDias(hoje, -3)));
  await esperar(() => caixa('idA').textContent.includes(formatarLongo(somarDias(hoje, -3))));
  ok('tocar na caixa "antes" troca o antes', caixa('idA').textContent.includes(formatarLongo(somarDias(hoje, -3))), true);
  ok('o "depois" ficou como estava', caixa('idB').textContent, depoisAntes);
  // "Depois" mais antigo que o "antes": a tela reordena e as caixas acompanham.
  caixa('idB').click();
  await esperar(() => dialogo());
  await tocarNoDialogo(formatarLongo(ontem));
  await esperar(() => caixa('idB').textContent.includes(formatarLongo(ontem)));
  ok('a mais nova sempre fica no "depois"', [
    caixa('idA').textContent.includes(formatarLongo(somarDias(hoje, -3))),
    caixa('idB').textContent.includes(formatarLongo(ontem)),
  ], [true, true]);
  caixa('idA').click();
  await esperar(() => dialogo());
  ok('depois de reordenar, a caixa "antes" marca como atual a que ela mostra',
    [...dialogo().querySelectorAll('li button')].find((b) => b.textContent.includes('atual'))?.textContent.includes(formatarLongo(somarDias(hoje, -3))), true);
  await tocarNoDialogo('Cancelar');

  /* --- dieta: kcal da refeição = opções escolhidas --- */
  await nav.recomecar('dieta');
  await esperar(() => conteudo.querySelector('.refeicao-kcal'));
  const { plano } = await dieta.planoDoDia(hoje);
  const dia = await dieta.calcularDia(plano.id);
  ok('cada refeição mostra as kcal das opções escolhidas, não a faixa',
    [...conteudo.querySelectorAll('.refeicao-kcal')].map((e) => e.textContent),
    dia.refeicoes.map((r) => num(r.total.kcal, 0) + ' kcal'));
  ok('nenhuma refeição mostra faixa', [...conteudo.querySelectorAll('.refeicao-kcal')].some((e) => e.textContent.includes('–')), false);

  const comGrupo = dia.refeicoes.find((r) => r.itens.some((i) => i.tipo === 'grupo' && i.opcoes.length > 1));
  if (comGrupo) {
    const grupo = comGrupo.itens.find((i) => i.tipo === 'grupo' && i.opcoes.length > 1);
    const outra = grupo.opcoes.find((o) => !o.padrao);
    const indiceRef = dia.refeicoes.indexOf(comGrupo);
    const esperado = comGrupo.total.kcal - grupo.valores.kcal + outra.valores.kcal;
    const pilula = [...conteudo.querySelectorAll('.pilula-opcao')].find((p) => p.textContent.startsWith(outra.nome) && p.getAttribute('aria-pressed') === 'false');
    pilula.click();
    await esperar(() => conteudo.querySelectorAll('.refeicao-kcal')[indiceRef]?.textContent === num(esperado, 0) + ' kcal');
    ok('trocar a opção atualiza as kcal da refeição', conteudo.querySelectorAll('.refeicao-kcal')[indiceRef].textContent, num(esperado, 0) + ' kcal');
    await dieta.escolherOpcao(comGrupo.refeicaoId, grupo.itemId, grupo.opcoes.find((o) => o.padrao).opcaoId);
  } else {
    ok('o plano de teste tem uma refeição com grupo', false, true);
  }

  /* --- prato: preencher as quantidades tira o "incompleto" --- */
  const prato = await dietaRepo.buscarPrato('prato-sanduiche-sem-manteiga');
  await dietaRepo.salvarPrato({
    ...prato,
    ingredientes: prato.ingredientes.map((i) => ({ ...i, quantidade: i.quantidade ?? 30 })),
  });
  await nav.abrir('pratos');
  await esperar(() => conteudo.querySelector('.card-clicavel'));
  const cardDoPrato = (nome) => [...conteudo.querySelectorAll('.card-clicavel')].find((c) => c.querySelector('h3').textContent === nome);
  ok('prato com tudo preenchido (só a fibra em branco) não é incompleto',
    Boolean(cardDoPrato('Sanduíche sem manteiga').querySelector('.etiqueta-aviso')), false);
  ok('prato com quantidade em branco continua incompleto',
    Boolean(cardDoPrato('Sanduíche com manteiga').querySelector('.etiqueta-aviso')), true);

  /* --- alimento em kJ: convertido para kcal, kJ nunca aparece --- */
  await nav.voltarUmaTela();
  await nav.abrir('alimentos');
  await esperar(() => botaoComTexto('+ novo alimento'));
  botaoComTexto('+ novo alimento').click();
  await esperar(() => dialogo()?.querySelector('[name="unidadeEnergia"]'));
  const form = dialogo();
  form.querySelector('[name="nome"]').value = 'Teste em kJ';
  form.querySelector('[name="kcal"]').value = '1000';
  form.querySelector('[name="unidadeEnergia"]').value = 'kj';
  form.querySelector('[name="proteina"]').value = '10';
  form.querySelector('[name="gordura"]').value = '5';
  form.querySelector('[name="carbo"]').value = '30';
  form.querySelector('[data-acao="ok"]').click();
  await esperar(() => telaAtual() === 'alimento-editor');
  const criado = (await dietaRepo.listarAlimentos()).find((a) => a.nome === 'Teste em kJ');
  ok('1000 kJ foi salvo como 239 kcal', criado?.kcal, 239);
  ok('a unidade de energia não vai para o banco', 'unidadeEnergia' in (criado ?? {}), false);
  await esperar(() => conteudo.textContent.includes('kcal'));
  ok('a tela do alimento mostra kcal', conteudo.textContent.includes('239 kcal'), true);
  ok('a tela do alimento não mostra kJ', /kj/i.test(conteudo.textContent), false);

  // Editar sem mexer na unidade não pode converter de novo.
  botaoComTexto('Editar valores').click();
  await esperar(() => dialogo()?.querySelector('[name="unidadeEnergia"]'));
  ok('o formulário de edição abre em kcal', [dialogo().querySelector('[name="kcal"]').value, dialogo().querySelector('[name="unidadeEnergia"]').value], ['239', 'kcal']);
  dialogo().querySelector('[data-acao="ok"]').click();
  await pausa(300);
  ok('salvar de novo em kcal não converte duas vezes', (await dietaRepo.buscarAlimento(criado.id)).kcal, 239);

  // kcal digitado em kcal passa direto.
  botaoComTexto('Editar valores').click();
  await esperar(() => dialogo()?.querySelector('[name="kcal"]'));
  dialogo().querySelector('[name="kcal"]').value = '250.5';
  dialogo().querySelector('[data-acao="ok"]').click();
  await pausa(300);
  ok('kcal com decimal é salvo como número', (await dietaRepo.buscarAlimento(criado.id)).kcal, 250.5);

  // Trocar para kJ na edição converte o número digitado.
  botaoComTexto('Editar valores').click();
  await esperar(() => dialogo()?.querySelector('[name="kcal"]'));
  dialogo().querySelector('[name="kcal"]').value = '2092';
  dialogo().querySelector('[name="unidadeEnergia"]').value = 'kj';
  dialogo().querySelector('[data-acao="ok"]').click();
  await pausa(300);
  ok('editar em kJ converte (2092 kJ = 500 kcal)', (await dietaRepo.buscarAlimento(criado.id)).kcal, 500);

  // kJ em branco continua em branco, não vira zero.
  botaoComTexto('Editar valores').click();
  await esperar(() => dialogo()?.querySelector('[name="kcal"]'));
  dialogo().querySelector('[name="kcal"]').value = '';
  dialogo().querySelector('[name="unidadeEnergia"]').value = 'kj';
  dialogo().querySelector('[data-acao="ok"]').click();
  await pausa(300);
  ok('kJ em branco fica em branco', (await dietaRepo.buscarAlimento(criado.id)).kcal, null);
  await dieta.excluirAlimento(criado.id);

  /* --- versão nas configurações --- */
  const { VERSAO } = await import('/js/versao.js');
  await nav.abrir('configuracoes');
  await esperar(() => conteudo.querySelector('.versao-app'));
  ok('as configurações mostram a versão', conteudo.querySelector('.versao-app')?.textContent.startsWith('Versão ' + VERSAO + ' · '), true);

  for (const s of await svc.listarSessoes()) await svc.apagarSessao(s.id);
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
      `(async () => { try { const t = await import('/js/data/treinos-repo.js'); return (await t.listarTreinos()).length > 0 && !document.getElementById('conteudo').textContent.includes('Carregando'); } catch { return false; } })()`
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
