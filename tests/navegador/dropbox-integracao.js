/**
 * Teste da Etapa 9 num navegador de verdade, sem tocar no Dropbox.
 *
 * O que dá para provar sem rede — e é justamente o que eu não quero
 * descobrir quebrado na academia:
 *
 *  - os módulos de `js/sync/` carregam no navegador, com os imports certos;
 *  - **salvar continua funcionando sem Dropbox conectado**. Esta é a
 *    regressão que mais assusta: o gatilho foi parar dentro do repositório
 *    da dieta e do `finalizarSessao`, ou seja, no caminho de escrita do
 *    app inteiro. Se ele estourar, some a capacidade de registrar treino;
 *  - o gatilho não agenda nada enquanto não há conexão;
 *  - os tokens ficam fora do banco, então **não entram no backup**;
 *  - o PKCE gera desafio do tamanho e do formato certos, e a URL de
 *    autorização muda conforme o fluxo (com ou sem redirecionamento).
 *
 * O login e o upload em si só dá para testar com a conta de verdade, no
 * aparelho de verdade.
 *
 *   deno run -A tests/navegador/dropbox-integracao.js
 */

import { conectar, lancarNavegador, servir } from './cdp.js';

const raiz = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PORTA_DEVTOOLS = 9234;

const cenario = String.raw`
(async () => {
  const log = [];
  const ok = (nome, real, esperado) =>
    log.push({ nome, passou: JSON.stringify(real) === JSON.stringify(esperado), real, esperado });

  const estado = await import('/js/sync/dropbox-estado.js');
  const config = await import('/js/sync/dropbox-config.js');
  const gatilho = await import('/js/sync/gatilho.js');
  const dieta = await import('/js/services/dieta-service.js');
  const dietaRepo = await import('/js/data/dieta-repo.js');
  const sessoes = await import('/js/services/sessao-service.js');
  const treinos = await import('/js/services/treino-service.js');
  const backup = await import('/js/services/backup-service.js');
  const seed = await import('/js/services/seed-service.js');

  // A página de teste é uma aba em branco: sem a carga inicial não há
  // treino A para finalizar uma sessão em cima.
  await seed.carregarSeNecessario();

  // Parte de um aparelho que nunca conectou.
  estado.limparEstado();
  ok('sem conexão, conectado() é falso', estado.conectado(), false);
  ok('e o estado vem zerado', estado.lerEstado().ultimoEm, null);

  /* --- salvar continua funcionando sem Dropbox --------------------- */

  const alimento = await dieta.criarAlimento({
    nome: 'Teste Dropbox',
    unidade: 'g',
    porcao: 100,
    kcal: 100,
    proteina: 10,
    carboidrato: 10,
    gordura: 1,
  });
  ok('criar alimento funciona sem Dropbox', Boolean(alimento && alimento.id), true);
  ok('e ele está no banco', Boolean(await dietaRepo.buscarAlimento(alimento.id)), true);

  await dietaRepo.salvarAlimento({ ...alimento, nome: 'Teste Dropbox 2' });
  ok(
    'salvar por cima também',
    (await dietaRepo.buscarAlimento(alimento.id)).nome,
    'Teste Dropbox 2'
  );

  await dieta.excluirAlimento(alimento.id);
  ok('e excluir', await dietaRepo.buscarAlimento(alimento.id), undefined);

  const A = (await treinos.listarTreinos()).find((t) => t.nome === 'A');
  const sessao = await sessoes.iniciarSessao(A.id, '2026-09-22');
  const finalizada = await sessoes.finalizarSessao(sessao);
  ok('finalizar sessão funciona sem Dropbox', finalizada.status, 'finalizada');
  await sessoes.apagarSessao(sessao.id);

  /* --- o gatilho não faz nada desconectado ------------------------- */

  gatilho.dadosMudaram();
  gatilho.dadosMudaram('sessao');
  await new Promise((r) => setTimeout(r, 60));
  ok('gatilho desconectado não marca pendente', estado.lerEstado().pendente, false);
  ok('nem grava data de backup', estado.lerEstado().ultimoEm, null);

  /* --- reforma pesada: apagar exercício, músculo e alimento -------- */

  // A pergunta que motivou isto: mudar a rotação inteira e apagar coisas
  // quebra o backup? Não deveria — o backup é um retrato completo do
  // banco, não uma diferença. Mas "não deveria" não é teste.
  const exSvc = await import('/js/services/exercicio-service.js');
  const antesDaReforma = await backup.montarBackup();

  const exercicio = await exSvc.criar('Exercício Descartável', 'carga', []);
  const musculo = await exSvc.criarMusculo('Músculo Descartável');
  const comida = await dieta.criarAlimento({
    nome: 'Alimento Descartável',
    unidade: 'g',
    porcao: 100,
    kcal: 50,
    proteina: 5,
    carboidrato: 5,
    gordura: 1,
  });

  const comTudo = await backup.montarBackup();
  ok(
    'o que foi criado entra no backup',
    JSON.stringify(comTudo).includes('Exercício Descartável'),
    true
  );

  await exSvc.excluir(exercicio.id);
  await exSvc.excluirMusculo(musculo.id);
  await dieta.excluirAlimento(comida.id);

  const depois = await backup.montarBackup();
  const texto3 = JSON.stringify(depois);
  ok('depois de apagar, o exercício sai do backup', texto3.includes('Exercício Descartável'), false);
  ok('o músculo também', texto3.includes('Músculo Descartável'), false);
  ok('e o alimento também', texto3.includes('Alimento Descartável'), false);
  ok('o backup continua válido', backup.validarBackup(depois).ok, true);
  ok(
    'e volta ao tamanho de antes da reforma',
    Object.keys(depois.dados).length,
    Object.keys(antesDaReforma.dados).length
  );

  // O caminho de volta: restaurar o retrato anterior traz tudo de novo.
  await backup.restaurar(comTudo);
  ok('restaurar o backup anterior traz o exercício de volta', Boolean(await exSvc.buscarExercicio(exercicio.id)), true);
  ok('sem divergência na conferência', (await backup.conferirRestauracao(comTudo)).length, 0);

  await backup.restaurar(depois);
  ok('e dá para voltar ao estado sem ele', await exSvc.buscarExercicio(exercicio.id), undefined);

  /* --- o token não entra no backup --------------------------------- */

  estado.salvarEstado({
    refreshToken: 'token-de-mentira',
    conta: 'Fulano',
    ultimoEm: '2026-09-22T10:00:00.000Z',
  });
  ok('agora conectado() é verdadeiro', estado.conectado(), true);

  const arquivo = await backup.montarBackup();
  const texto = JSON.stringify(arquivo);
  ok('o backup não carrega o refresh token', texto.includes('token-de-mentira'), false);
  ok('nem o nome da conta', texto.includes('Fulano'), false);
  ok(
    'porque o estado do Dropbox não é uma store do banco',
    Object.keys(arquivo.dados).includes('dropbox'),
    false
  );

  estado.limparEstado();
  ok('desconectar apaga o token', estado.lerEstado().refreshToken, null);

  /* --- PKCE e a URL de autorização --------------------------------- */

  const auth = await import('/js/sync/dropbox-auth.js');

  // A chave de propósito não está no código: o repositório é público.
  ok('o código não carrega o app key', config.APP_KEY, '');
  localStorage.removeItem(config.CHAVE_APP_KEY);
  ok('sem chave colada, não há app key', estado.lerAppKey(), '');

  let semChave = '';
  try {
    await auth.urlDeAutorizacao({ comRedirect: false });
  } catch (erro) {
    semChave = erro.name;
  }
  ok('e conectar sem chave dá erro identificável', semChave, 'SemAppKey');

  estado.salvarAppKey('appkeydementira');
  ok('depois de colar, a chave do aparelho é que vale', estado.lerAppKey(), 'appkeydementira');

  const comCodigo = await auth.urlDeAutorizacao({ comRedirect: false });
  const semRedirect = new URL(comCodigo);
  ok('o fluxo do código não manda redirect_uri', semRedirect.searchParams.has('redirect_uri'), false);
  ok('pede acesso offline', semRedirect.searchParams.get('token_access_type'), 'offline');
  ok('usa PKCE com S256', semRedirect.searchParams.get('code_challenge_method'), 'S256');
  ok('e manda o app key', semRedirect.searchParams.get('client_id'), 'appkeydementira');

  const desafio = semRedirect.searchParams.get('code_challenge');
  ok('o desafio tem o tamanho de um SHA-256 em base64url', desafio.length, 43);
  ok('e não tem caractere que precise de escape', /^[A-Za-z0-9_-]+$/.test(desafio), true);

  const comRedirect = new URL(await auth.urlDeAutorizacao({ comRedirect: true }));
  ok(
    'o outro fluxo manda o endereço desta página',
    comRedirect.searchParams.get('redirect_uri'),
    config.redirectUri()
  );
  ok(
    'e o redirect_uri não leva query string junto',
    comRedirect.searchParams.get('redirect_uri').includes('?'),
    false
  );

  const primeiro = new URL(await auth.urlDeAutorizacao({ comRedirect: false })).searchParams.get('code_challenge');
  const segundo = new URL(await auth.urlDeAutorizacao({ comRedirect: false })).searchParams.get('code_challenge');
  ok('cada login sorteia um desafio novo', primeiro === segundo, false);

  /* --- código colado sem pedido aberto ----------------------------- */

  localStorage.removeItem(config.CHAVE_VERIFIER);
  let recado = '';
  try {
    await auth.trocarCodigoPorToken('123', { comRedirect: false });
  } catch (erro) {
    recado = erro.message;
  }
  ok('sem o verifier, o erro explica o que houve', recado.includes('se perdeu neste aparelho'), true);

  // Rodando em localhost, o botão de redirecionamento fica escondido
  // porque só o endereço publicado está cadastrado no Dropbox.
  ok('em localhost o redirect não é oferecido', config.podeUsarRedirect(), false);

  localStorage.removeItem(config.CHAVE_APP_KEY);
  estado.limparEstado();
  ok('o banco ficou limpo do teste', (await dietaRepo.listarAlimentos()).some((a) => a.nome.startsWith('Teste Dropbox')), false);

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
