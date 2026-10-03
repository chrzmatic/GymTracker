/**
 * Login no Dropbox com OAuth + PKCE, sem app secret.
 *
 * Dois caminhos:
 * - com redirecionamento: o Dropbox volta para o app com `?code=` na URL;
 * - com código colado: para o app da Tela de Início do iPhone, que não
 *   recebe a volta do Safari. O Dropbox mostra o código e você cola.
 *
 * `token_access_type=offline` pede um refresh token de longa duração.
 */

import {
  OAUTH_AUTORIZAR,
  OAUTH_TOKEN,
  CHAVE_VERIFIER,
  redirectUri,
} from './dropbox-config.js';
import { lerEstado, salvarEstado, limparEstado, lerAppKey } from './dropbox-estado.js';

/** Falta o app key. */
export class SemAppKey extends Error {
  constructor() {
    super('Falta o app key do Dropbox.');
    this.name = 'SemAppKey';
  }
}

/** Bytes em base64url (sem `+`, `/` nem `=`). */
function base64url(bytes) {
  let texto = '';
  new Uint8Array(bytes).forEach((b) => {
    texto += String.fromCharCode(b);
  });
  return btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** `code_verifier`: 64 bytes aleatórios em base64url. */
function gerarVerifier() {
  const bytes = new Uint8Array(64);
  window.crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/** `code_challenge`: SHA-256 do verifier, em base64url. */
async function gerarDesafio(verifier) {
  const dados = new TextEncoder().encode(verifier);
  const hash = await window.crypto.subtle.digest('SHA-256', dados);
  return base64url(hash);
}

/** Guarda o verifier até o Dropbox responder. */
function guardarVerifier(verifier) {
  window.localStorage.setItem(CHAVE_VERIFIER, verifier);
}

/**
 * true se há um login esperando o código.
 * No iPhone o app pode ser descartado durante o login; assim a tela
 * oferece colar o código em vez de começar outro (que não combinaria).
 */
export function temPedidoPendente() {
  try {
    return Boolean(window.localStorage.getItem(CHAVE_VERIFIER));
  } catch {
    return false;
  }
}

/** Descarta o login pendente. */
export function esquecerPedido() {
  try {
    window.localStorage.removeItem(CHAVE_VERIFIER);
  } catch {
    /* nada a fazer */
  }
}

/** Lê e apaga o verifier: cada login usa um novo. */
function consumirVerifier() {
  const v = window.localStorage.getItem(CHAVE_VERIFIER);
  window.localStorage.removeItem(CHAVE_VERIFIER);
  return v;
}

/**
 * Endereço de autorização do Dropbox.
 * @param {{comRedirect: boolean}} opcoes
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
  // Sem `redirect_uri`, o Dropbox mostra o código na tela dele.
  if (comRedirect) params.set('redirect_uri', redirectUri());

  return OAUTH_AUTORIZAR + '?' + params.toString();
}

/**
 * Troca o código pelos tokens.
 * @param {string} codigo da URL ou colado
 * @param {{comRedirect: boolean}} opcoes igual ao do pedido
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

/** Mensagem útil para os erros comuns ao trocar o código. */
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

/** Renova o access token. Se o refresh token for recusado, desconecta. */
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
 * Access token válido, renovando com um minuto de folga.
 * @param {boolean} [forcar] renova mesmo se parecer válido
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
 * Conclui o login se a URL tem `?code=`.
 * Sempre limpa a URL, porque o código só vale uma vez.
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

/** Tira o `?code=` da URL sem recarregar. */
function limparQueryString() {
  const limpo = window.location.pathname + window.location.hash;
  window.history.replaceState({}, '', limpo);
}

/** Nome da conta, só para mostrar. Falhar aqui não derruba o login. */
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
