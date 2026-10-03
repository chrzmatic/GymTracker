/**
 * Aviso de "os dados mudaram" para o backup.
 *
 * Carrega o código do Dropbox só se houver conexão, para não pesar a
 * abertura do app. Assim os repositórios também não dependem do Dropbox.
 */

import { conectado } from './dropbox-estado.js';

/**
 * Avisa que algo foi salvo. Nunca lança erro nem atrasa quem salvou.
 * @param {string} [motivo] `alteracao` (padrão) ou `sessao` (fim de treino)
 */
export function dadosMudaram(motivo = 'alteracao') {
  if (!conectado()) return;

  import('./dropbox-backup.js')
    .then((m) => m.agendarBackup(motivo))
    .catch((erro) => console.warn('[dropbox] não consegui agendar o backup:', erro));
}
