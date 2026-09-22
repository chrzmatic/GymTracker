/**
 * Login no Dropbox com OAuth + PKCE (especificação, seção 6.9).
 *
 * ## Os dois caminhos, e por que são dois
 *
 * **Com redirecionamento** é o fluxo normal: o app manda você para o
 * Dropbox, você autoriza, e o Dropbox devolve para o endereço do app com
 * um `?code=` na URL.
 *
 * **Com código colado** existe por causa do iPhone. O app instalado na
 * Tela de Início roda numa janela própria, separada do Safari, com
 * armazenamento separado. Mandar o login para fora costuma abrir o Safari,
 * e aí o `?code=` volta para o *Safari*, não para o app — e o
 * `code_verifier` que combina com aquele código está guardado do outro
 * lado. O login trava sem explicação. Nesse caminho o Dropbox mostra o
 * código na tela dele, você copia e cola no app, e nada precisa atravessar
 * a fronteira entre os dois armazenamentos.
 *
 * ## PKCE em três linhas
 *
 * O app sorteia um número (`code_verifier`), manda ao Dropbox só o SHA-256
 * dele (`code_challenge`), e na hora de trocar o código pelo token
 * apresenta o número original. Quem interceptar o código no meio do
 * caminho não tem o número e não consegue trocá-lo por nada. É o que
 * permite não haver app secret neste projeto.
 *
 * `token_access_type=offline` é o que faz o Dropbox devolver um **refresh
 * token** de longa duração, em vez de só um acesso de 4 horas. Sem ele eu
 * teria que refazer o login toda tarde.
 */

import {
  OAUTH_AUTORIZAR,
  OAUTH_TOKEN,
  CHAVE_VERIFIER,
  redirectUri,
} from './dropbox-config.js';
import { lerEstado, salvarEstado, limparEstado, lerAppKey } from './dropbox-estado.js';

/** Erro de configuração: falta o app key. A tela sabe tratar. */
export class SemAppKey extends Error {
  constructor() {
    super('Falta o app key do Dropbox.');
    this.name = 'SemAppKey';
  }
}

/** Converte bytes em base64url (sem `+`, `/` nem `=`), como o PKCE exige. */
function base64url(bytes) {
  let texto = '';
  new Uint8Array(bytes).forEach((b) => {
    texto += String.fromCharCode(b);
  });
  return btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Sorteia o `code_verifier`: 64 bytes aleatórios em base64url. */
function gerarVerifier() {
  const bytes = new Uint8Array(64);
  window.crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/**
 * O `code_challenge`: SHA-256 do verifier, em base64url.
 * @param {string} verifier
 * @returns {Promise<string>}
 */
async function gerarDesafio(verifier) {
  const dados = new TextEncoder().encode(verifier);
  const hash = await window.crypto.subtle.digest('SHA-256', dados);
  return base64url(hash);
}

/** Guarda o verifier até a volta do Dropbox. */
function guardarVerifier(verifier) {
  window.localStorage.setItem(CHAVE_VERIFIER, verifier);
}

/**
 * Se há um pedido de login esperando um código.
 *
 * Existe por causa de uma armadilha do iPhone: o app da Tela de Início
 * pode ser descartado da memória enquanto você autoriza no Safari.
 * Voltando, o diálogo sumiu — e tocar em "conectar" de novo sortearia um
 * `code_verifier` novo, que **não combina** com o código que o Dropbox
 * acabou de mostrar. O login falharia com um "código inválido" sem causa
 * aparente, num código que acabou de nascer.
 *
 * Sabendo que há um pedido pendente, a tela oferece colar o código do
 * pedido antigo em vez de começar outro.
 *
 * @returns {boolean}
 */
export function temPedidoPendente() {
  try {
    return Boolean(window.localStorage.getItem(CHAVE_VERIFIER));
  } catch {
    return false;
  }
}

/** Descarta um pedido de login pendente. */
export function esquecerPedido() {
  try {
    window.localStorage.removeItem(CHAVE_VERIFIER);
  } catch {
    /* nada a fazer */
  }
}

/** Pega o verifier guardado e o remove: cada login usa um novo. */
function consumirVerifier() {
  const v = window.localStorage.getItem(CHAVE_VERIFIER);
  window.localStorage.removeItem(CHAVE_VERIFIER);
  return v;
}

/**
 * Monta o endereço de autorização do Dropbox.
 *
 * @param {{comRedirect: boolean}} opcoes
 * @returns {Promise<string>}
 */
export async function urlDeAutorizacao({ comRedirect }) {
  const appKey = lerAppKey();
  if (!appKey) throw new SemAppKey();

  const verifier = gerarVerifier();
  guardarVerifier(verifier);

  const params = new URLSearchParams({
    client_id: appKey,
    response_type: 'code',
    code_challenge: await gerarDesafio(verifier),
    code_challenge_method: 'S256',
    token_access_type: 'offline',
  });
  // Sem `redirect_uri`, o Dropbox mostra o código na própria tela dele
  // para eu copiar — que é exatamente o fluxo sem redirecionamento.
  if (comRedirect) params.set('redirect_uri', redirectUri());

  return OAUTH_AUTORIZAR + '?' + params.toString();
}

/**
 * Troca o código de autorização pelos tokens.
 *
 * @param {string} codigo o que veio na URL ou foi colado da tela do Dropbox
 * @param {{comRedirect: boolean}} opcoes precisa bater com o que foi pedido
 * @returns {Promise<Object>} o estado novo
 */
export async function trocarCodigoPorToken(codigo, { comRedirect }) {
  const appKey = lerAppKey();
  if (!appKey) throw new SemAppKey();

  const verifier = consumirVerifier();
  if (!verifier) {
    throw new Error(
      'O pedido de login se perdeu neste aparelho. Toque em conectar e tente de novo, sem fechar o app no meio.'
    );
  }

  const corpo = new URLSearchParams({
    code: String(codigo || '').trim(),
    grant_type: 'authorization_code',
    client_id: appKey,
    code_verifier: verifier,
  });
  if (comRedirect) corpo.set('redirect_uri', redirectUri());

  const resposta = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corpo.toString(),
  });

  if (!resposta.ok) {
    throw new Error(await descreverFalhaDeToken(resposta));
  }

  const dados = await resposta.json();
  if (!dados.refresh_token) {
    throw new Error(
      'O Dropbox não devolveu um token de longa duração. Confira se o app foi criado com acesso offline.'
    );
  }

  return salvarEstado({
    refreshToken: dados.refresh_token,
    accessToken: dados.access_token,
    expiraEm: Date.now() + (dados.expires_in || 14400) * 1000,
    conta: '',
    ultimoErro: null,
  });
}

/**
 * Traduz a recusa do Dropbox para algo acionável.
 *
 * Os dois erros que realmente acontecem aqui têm causa concreta e conserto
 * concreto, e a mensagem crua do Dropbox (`invalid_grant`) não conta
 * nenhum dos dois.
 *
 * @param {Response} resposta
 * @returns {Promise<string>}
 */
async function descreverFalhaDeToken(resposta) {
  let detalhe = '';
  try {
    const json = await resposta.json();
    detalhe = json.error_description || json.error || '';
  } catch {
    detalhe = await resposta.text().catch(() => '');
  }

  if (/invalid_grant/i.test(detalhe)) {
    return 'O código não serve mais. Ele vale uma vez só e por poucos minutos — peça um novo e cole logo em seguida.';
  }
  if (/redirect_uri/i.test(detalhe)) {
    return (
      'O Dropbox recusou o endereço de volta. Cadastre "' +
      redirectUri() +
      '" em Redirect URIs, na aba Settings do app.'
    );
  }
  return ('O Dropbox recusou o login (' + resposta.status + '). ' + detalhe).trim();
}

/**
 * Renova o access token usando o refresh token.
 *
 * O refresh token não expira sozinho; ele só cai se eu revogar o app no
 * Dropbox. Por isso, quando *ele* é recusado, a resposta certa é apagar a
 * conexão e pedir login de novo — insistir não adiantaria.
 *
 * @returns {Promise<string>} access token válido
 */
async function renovarAcesso() {
  const { refreshToken } = lerEstado();
  const appKey = lerAppKey();
  if (!refreshToken) throw new Error('Não está conectado ao Dropbox.');
  if (!appKey) throw new SemAppKey();

  const resposta = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: appKey,
    }).toString(),
  });

  if (resposta.status === 400 || resposta.status === 401) {
    limparEstado();
    throw new Error(
      'O Dropbox não aceita mais esta conexão. Conecte de novo nas configurações.'
    );
  }
  if (!resposta.ok) {
    throw new Error('Não consegui renovar o acesso ao Dropbox (' + resposta.status + ').');
  }

  const dados = await resposta.json();
  salvarEstado({
    accessToken: dados.access_token,
    expiraEm: Date.now() + (dados.expires_in || 14400) * 1000,
  });
  return dados.access_token;
}

/**
 * Devolve um access token válido, renovando quando preciso.
 *
 * Renova com um minuto de folga: um token que expira no meio de um upload
 * de 200 KB numa rede lenta falharia por uma diferença de segundos.
 *
 * @param {boolean} [forcar] renova mesmo que o guardado pareça válido
 * @returns {Promise<string>}
 */
export async function tokenValido(forcar = false) {
  const estado = lerEstado();
  if (!estado.refreshToken) throw new Error('Não está conectado ao Dropbox.');

  const folga = 60 * 1000;
  if (!forcar && estado.accessToken && estado.expiraEm - folga > Date.now()) {
    return estado.accessToken;
  }
  return await renovarAcesso();
}

/**
 * Procura um `?code=` deixado pelo Dropbox na URL e conclui o login.
 *
 * Limpa a query string ao terminar, dê certo ou não: deixar o código na
 * barra de endereços faz um F5 tentar usá-lo de novo, e ele vale uma vez
 * só — o que apareceria como um erro de login logo depois de um login que
 * deu certo.
 *
 * @returns {Promise<{houve: boolean, ok?: boolean, erro?: string}>}
 */
export async function concluirLoginDoRedirect() {
  const params = new URLSearchParams(window.location.search);
  const codigo = params.get('code');
  const recusa = params.get('error');
  if (!codigo && !recusa) return { houve: false };

  limparQueryString();

  if (recusa) {
    return {
      houve: true,
      ok: false,
      erro:
        params.get('error_description') || 'O login no Dropbox foi cancelado ou recusado.',
    };
  }

  try {
    await trocarCodigoPorToken(codigo, { comRedirect: true });
    return { houve: true, ok: true };
  } catch (erro) {
    return { houve: true, ok: false, erro: erro.message };
  }
}

/** Tira `?code=...` da barra de endereços sem recarregar a página. */
function limparQueryString() {
  const limpo = window.location.pathname + window.location.hash;
  window.history.replaceState({}, '', limpo);
}

/**
 * Pergunta ao Dropbox de quem é a conta, só para a tela ter o que mostrar.
 * Falhar aqui não é motivo para o login falhar.
 * @returns {Promise<string>}
 */
export async function nomeDaConta() {
  try {
    const { chamar } = await import('./dropbox-api.js');
    const conta = await chamar('users/get_current_account', null);
    const nome = (conta && conta.name && conta.name.display_name) || '';
    if (nome) salvarEstado({ conta: nome });
    return nome;
  } catch {
    return '';
  }
}

/** Desconecta: apaga tokens e estado deste aparelho. */
export function desconectar() {
  limparEstado();
}
