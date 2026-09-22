/**
 * O aviso de "os dados mudaram", para quem salva não precisar conhecer o
 * Dropbox.
 *
 * ## Por que não chamar `dropbox-backup.js` direto
 *
 * Porque quem chama é `dieta-repo.js` e `sessao-service.js`, que carregam
 * na abertura do app. Importá-lo ali arrastaria junto o `backup-service`,
 * a API do Dropbox e a autenticação — código que a maioria das aberturas
 * não usa, e que no iPhone sai do cache do service worker e vira tempo de
 * tela branca.
 *
 * Aqui o import é dinâmico e só acontece quando há uma conexão de verdade.
 * Quem nunca conectou o Dropbox paga o preço de uma leitura no
 * `localStorage`.
 *
 * Também é este isolamento que mantém a regra da arquitetura de pé: um
 * repositório continua sem saber que Dropbox existe. Ele só anuncia que
 * gravou alguma coisa.
 */

import { conectado } from './dropbox-estado.js';

/**
 * Anuncia que algo digno de backup foi salvo.
 *
 * Nunca estoura e nunca devolve promessa: salvar um alimento não pode
 * ficar mais lento, nem falhar, por causa do backup.
 *
 * @param {string} [motivo] `alteracao` (padrão) ou `sessao` (fim de treino)
 */
export function dadosMudaram(motivo = 'alteracao') {
  if (!conectado()) return;

  import('./dropbox-backup.js')
    .then((m) => m.agendarBackup(motivo))
    .catch((erro) => console.warn('[dropbox] não consegui agendar o backup:', erro));
}
