/**
 * Tokens e estado do backup, guardados **fora** do banco de dados.
 *
 * ## Por que no localStorage e não no IndexedDB
 *
 * O backup JSON varre todas as stores do banco (ver `backup-service.js`).
 * Se o token do Dropbox morasse na store `config`, ele iria junto dentro
 * do arquivo enviado para o próprio Dropbox — e, pior, restaurar um backup
 * de três meses atrás plantaria de volta um refresh token velho por cima
 * do bom, derrubando a conexão sem motivo aparente.
 *
 * Token é estado *deste aparelho*, não dado do usuário. Fica no
 * `localStorage`, junto de onde a navegação guarda a aba atual, e nunca
 * entra em backup nenhum.
 *
 * Formato guardado:
 * ```
 * {
 *   refreshToken: string,   // longa duração, é o que mantém a conexão
 *   accessToken: string,    // curta duração (4h), renovado pelo refresh
 *   expiraEm: number,       // epoch ms de validade do accessToken
 *   conta: string,          // nome da conta, só para a tela mostrar
 *   ultimoEm: string|null,  // ISO do último backup que deu certo
 *   pendente: boolean,      // há alteração esperando internet
 *   ultimoErro: string|null
 * }
 * ```
 */

import { CHAVE_ESTADO, CHAVE_APP_KEY, APP_KEY } from './dropbox-config.js';

/** Estado de quem nunca conectou. */
const VAZIO = {
  refreshToken: null,
  accessToken: null,
  expiraEm: 0,
  conta: '',
  ultimoEm: null,
  pendente: false,
  ultimoErro: null,
};

/**
 * Lê o estado guardado.
 *
 * Nunca estoura: um `localStorage` bloqueado (navegação privada) ou um
 * JSON corrompido devolvem o estado vazio, e o app segue funcionando sem
 * backup em vez de não abrir.
 *
 * @returns {Object}
 */
export function lerEstado() {
  try {
    const bruto = window.localStorage.getItem(CHAVE_ESTADO);
    if (!bruto) return { ...VAZIO };
    return { ...VAZIO, ...JSON.parse(bruto) };
  } catch {
    return { ...VAZIO };
  }
}

/**
 * Grava por cima do estado atual só os campos passados.
 * @param {Object} mudancas
 * @returns {Object} o estado novo
 */
export function salvarEstado(mudancas) {
  const novo = { ...lerEstado(), ...mudancas };
  try {
    window.localStorage.setItem(CHAVE_ESTADO, JSON.stringify(novo));
  } catch (erro) {
    console.warn('[dropbox] não consegui guardar o estado:', erro);
  }
  return novo;
}

/** Apaga tokens e estado do aparelho. É o "desconectar" da especificação. */
export function limparEstado() {
  try {
    window.localStorage.removeItem(CHAVE_ESTADO);
  } catch {
    /* nada a fazer */
  }
}

/** @returns {boolean} se há refresh token guardado. */
export function conectado() {
  return Boolean(lerEstado().refreshToken);
}

/**
 * O app key em uso: o fixo do código, ou o digitado na tela enquanto o
 * código ainda não tem um.
 * @returns {string}
 */
export function lerAppKey() {
  if (APP_KEY) return APP_KEY;
  try {
    return window.localStorage.getItem(CHAVE_APP_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * Guarda o app key digitado na tela.
 * @param {string} chave
 */
export function salvarAppKey(chave) {
  try {
    window.localStorage.setItem(CHAVE_APP_KEY, String(chave || '').trim());
  } catch (erro) {
    console.warn('[dropbox] não consegui guardar o app key:', erro);
  }
}
