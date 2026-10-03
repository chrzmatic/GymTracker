/**
 * Tokens e estado do backup, no localStorage.
 *
 * Ficam fora do IndexedDB para não entrarem no backup: restaurar um backup
 * antigo traria de volta um token velho.
 *
 * Formato:
 * ```
 * {
 *   refreshToken: string,   // longa duração
 *   accessToken: string,    // 4h, renovado pelo refresh
 *   expiraEm: number,       // epoch ms
 *   conta: string,          // só para mostrar
 *   ultimoEm: string|null,  // ISO do último backup que deu certo
 *   pendente: boolean,      // há alteração esperando rede
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
 * Lê o estado. Nunca lança erro: localStorage bloqueado ou JSON
 * quebrado devolvem o estado vazio.
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
 * Atualiza só os campos passados.
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

/** Apaga tokens e estado deste aparelho. */
export function limparEstado() {
  try {
    window.localStorage.removeItem(CHAVE_ESTADO);
  } catch {
    /* nada a fazer */
  }
}

/** true se há refresh token. */
export function conectado() {
  return Boolean(lerEstado().refreshToken);
}

/** App key em uso: o do código ou, se vazio, o colado na tela. */
export function lerAppKey() {
  if (APP_KEY) return APP_KEY;
  try {
    return window.localStorage.getItem(CHAVE_APP_KEY) || '';
  } catch {
    return '';
  }
}

export function salvarAppKey(chave) {
  try {
    window.localStorage.setItem(CHAVE_APP_KEY, String(chave || '').trim());
  } catch (erro) {
    console.warn('[dropbox] não consegui guardar o app key:', erro);
  }
}
