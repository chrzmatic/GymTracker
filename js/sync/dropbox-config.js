/**
 * Constantes do backup no Dropbox.
 *
 * O app key não é segredo no PKCE, mas o dono prefere não deixá-lo no
 * repositório. Por isso `APP_KEY` fica vazio e cada aparelho recebe a chave
 * uma vez pela tela do Dropbox (guardada no localStorage).
 * A chave está em dropbox.com/developers/apps, aba Settings.
 */

/** Vazio de propósito (ver acima). Se preenchido, vale para todos os aparelhos. */
export const APP_KEY = '';

/** Onde fica o app key colado na tela. */
export const CHAVE_APP_KEY = 'gymtracker:dropbox:appkey';

/** Tokens e estado do backup (ver dropbox-estado.js). */
export const CHAVE_ESTADO = 'gymtracker:dropbox';

/** `code_verifier` durante o login. */
export const CHAVE_VERIFIER = 'gymtracker:dropbox:verifier';

/** Arquivo sobrescrito a cada backup. */
export const ARQUIVO_ATUAL = '/backup-atual.json';

/** Pasta das cópias diárias. */
export const PASTA_DIARIO = '/diario';

/** Cópias diárias mantidas. */
export const MAX_DIARIOS = 7;

/** Idade do último backup para o app refazer um ao abrir. */
export const INTERVALO_MS = 24 * 60 * 60 * 1000;

/** Espera mínima entre backups automáticos. Manual e fim de treino ignoram. */
export const ESPERA_ENTRE_BACKUPS_MS = 5 * 60 * 1000;

/** Quanto esperar sem alterações antes de enviar. */
export const DEBOUNCE_MS = 20 * 1000;

/** Endpoints da API. */
export const OAUTH_AUTORIZAR = 'https://www.dropbox.com/oauth2/authorize';
export const OAUTH_TOKEN = 'https://api.dropboxapi.com/oauth2/token';
export const API_RPC = 'https://api.dropboxapi.com/2';
export const API_CONTEUDO = 'https://content.dropboxapi.com/2';

/**
 * Endereço de volta do login: a página atual, sem query string.
 * Precisa bater exatamente com o cadastrado no Dropbox.
 */
export function redirectUri() {
  const { origin, pathname } = window.location;
  const pasta = pathname.replace(/[^/]*$/, '');
  return origin + pasta;
}

/**
 * true se o login com redirecionamento funciona aqui.
 * Só o endereço publicado está cadastrado; em localhost usa o código colado.
 */
export function podeUsarRedirect() {
  const { hostname, protocol } = window.location;
  if (protocol !== 'https:') return false;
  return hostname !== 'localhost' && hostname !== '127.0.0.1';
}
