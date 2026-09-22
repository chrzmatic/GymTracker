/**
 * Endereços e constantes do backup no Dropbox (especificação, seção 6.9).
 *
 * ## Por que o app key pode ficar aqui, à vista
 *
 * O fluxo usado é OAuth com **PKCE**, feito justamente para apps que rodam
 * no navegador e não conseguem esconder segredo nenhum. Nele o app key é
 * público e sozinho não serve para nada: quem trocar o código de
 * autorização por um token precisa apresentar o `code_verifier`, um número
 * aleatório que nasce e morre neste aparelho. Não existe app secret neste
 * projeto, e não deve existir.
 *
 * ## Por que, ainda assim, ele não está escrito aqui
 *
 * Decisão do dono do projeto: o repositório é público, e mesmo sendo
 * seguro publicar o app key, ele prefere não deixá-lo à vista. Então
 * `APP_KEY` fica vazio e cada aparelho recebe a chave uma vez, pela tela
 * do Dropbox (⚙︎ → Dropbox → "Colar o app key"), que a guarda no
 * `localStorage` local.
 *
 * Perder a chave não é problema: ela aparece sempre em
 * dropbox.com/developers/apps, na aba Settings do app.
 *
 * Para voltar atrás, basta escrever a chave em `APP_KEY`: a tela de colar
 * some sozinha e todos os aparelhos passam a usar o valor do código.
 */

/**
 * App key criado em dropbox.com/developers/apps.
 * Vazio de propósito — ver acima. Quem manda é o valor colado na tela.
 */
export const APP_KEY = '';

/** Onde o app key digitado na tela fica guardado, quando `APP_KEY` é vazio. */
export const CHAVE_APP_KEY = 'gymtracker:dropbox:appkey';

/** Onde ficam os tokens e o estado do backup. Ver `dropbox-estado.js`. */
export const CHAVE_ESTADO = 'gymtracker:dropbox';

/** Onde o `code_verifier` do PKCE espera enquanto o login acontece. */
export const CHAVE_VERIFIER = 'gymtracker:dropbox:verifier';

/** Arquivo sobrescrito a cada backup. */
export const ARQUIVO_ATUAL = '/backup-atual.json';

/** Pasta das cópias diárias. */
export const PASTA_DIARIO = '/diario';

/** Quantas cópias diárias manter. As mais antigas são apagadas. */
export const MAX_DIARIOS = 7;

/** Idade máxima do último backup antes de o app refazer um ao abrir. */
export const INTERVALO_MS = 24 * 60 * 60 * 1000;

/**
 * Espera mínima entre dois backups automáticos seguidos.
 *
 * Sem isso, editar cinco alimentos seguidos mandaria o banco inteiro cinco
 * vezes pela rede — e no meio de um treino, na internet da academia, isso
 * é gasto puro. Um backup manual, ou o de fim de sessão, ignora a espera.
 */
export const ESPERA_ENTRE_BACKUPS_MS = 5 * 60 * 1000;

/** Quanto o app espera parar de digitar antes de mandar o backup. */
export const DEBOUNCE_MS = 20 * 1000;

/** Endpoints da API. Separados porque o Dropbox usa hosts diferentes. */
export const OAUTH_AUTORIZAR = 'https://www.dropbox.com/oauth2/authorize';
export const OAUTH_TOKEN = 'https://api.dropboxapi.com/oauth2/token';
export const API_RPC = 'https://api.dropboxapi.com/2';
export const API_CONTEUDO = 'https://content.dropboxapi.com/2';

/**
 * Endereço para onde o Dropbox devolve o login.
 *
 * Calculado da página em vez de escrito na mão porque o app roda em três
 * lugares — `localhost`, o GitHub Pages e o ícone da Tela de Início — e o
 * Dropbox exige que o endereço bata **exatamente** com um dos cadastrados
 * no App Console. A query string sai fora: o Dropbox recusa redirect URI
 * com parâmetros.
 *
 * @returns {string}
 */
export function redirectUri() {
  const { origin, pathname } = window.location;
  const pasta = pathname.replace(/[^/]*$/, '');
  return origin + pasta;
}

/**
 * Se dá para usar o login com redirecionamento neste endereço.
 *
 * No App Console está cadastrado só o endereço publicado — de propósito:
 * quanto menos endereços aceitam a volta do login, menos lugares um código
 * de autorização pode parar. A consequência é que, rodando em
 * `localhost`, o Dropbox recusaria a volta.
 *
 * Em vez de deixar o botão ali para falhar, a tela o esconde e manda usar
 * o fluxo do código colado, que funciona em qualquer endereço porque não
 * depende de redirecionamento nenhum.
 *
 * @returns {boolean}
 */
export function podeUsarRedirect() {
  const { hostname, protocol } = window.location;
  if (protocol !== 'https:') return false;
  return hostname !== 'localhost' && hostname !== '127.0.0.1';
}
