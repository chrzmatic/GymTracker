/**
 * O backup automático em si: quando enviar, o que enviar, o que apagar e
 * como trazer de volta (especificação, seção 6.9).
 *
 * ## O que este arquivo *não* faz
 *
 * Não monta o backup nem o restaura. Isso já existe e já foi testado em
 * `services/backup-service.js`, que é o mesmo caminho do "Exportar JSON" e
 * do "Importar JSON" — inclusive a conferência que relê o banco depois de
 * gravar. O Dropbox aqui é só o transporte: leva e traz o mesmo arquivo.
 * Se um dia o formato do backup mudar, muda num lugar só.
 *
 * ## A fila de pendentes
 *
 * Academia com internet ruim é o caso normal, não a exceção. Quando o
 * envio falha por falta de rede, o app marca `pendente` e segue a vida —
 * nada de aviso vermelho no meio de uma série. O pendente sai na próxima
 * vez que o app abrir com conexão, ou no backup seguinte.
 *
 * A fila guarda só o *fato* de haver algo a enviar, não o conteúdo: o
 * backup é sempre o banco inteiro no momento do envio, então uma fila com
 * três backups velhos não teria utilidade nenhuma — o último cobre todos.
 */

import { montarBackup, validarBackup, restaurar, conferirRestauracao } from '../services/backup-service.js';
import { hojeIso } from '../utils/date.js';
import {
  ARQUIVO_ATUAL,
  PASTA_DIARIO,
  ESPERA_ENTRE_BACKUPS_MS,
  DEBOUNCE_MS,
  INTERVALO_MS,
} from './dropbox-config.js';
import { lerEstado, salvarEstado, conectado } from './dropbox-estado.js';
import { enviar, baixar, listar, apagarArquivo, SemInternet } from './dropbox-api.js';
import {
  caminhoDoDiario,
  diariosParaApagar,
  passouDoIntervalo,
  devoEnviar,
  ordenarParaRestaurar,
} from './rotacao-backups.js';

/** Quem quer saber quando o estado muda (a tela de configurações, o aviso). */
const ouvintes = new Set();

/** Evita dois envios ao mesmo tempo, que gastariam rede à toa. */
let enviando = null;

/** Timer do debounce das alterações. */
let agendado = null;

/**
 * Avisa quem estiver ouvindo que o estado mudou.
 * @param {Function} ouvinte
 * @returns {Function} para parar de ouvir
 */
export function aoMudar(ouvinte) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** Dispara os ouvintes com o estado atual. */
function avisar() {
  const atual = estado();
  ouvintes.forEach((o) => {
    try {
      o(atual);
    } catch (erro) {
      console.warn('[dropbox] ouvinte falhou:', erro);
    }
  });
}

/**
 * Estado atual, do jeito que as telas precisam ver.
 * @returns {{conectado: boolean, conta: string, ultimoEm: string|null, pendente: boolean, ultimoErro: string|null, enviando: boolean}}
 */
export function estado() {
  const e = lerEstado();
  return {
    conectado: Boolean(e.refreshToken),
    conta: e.conta,
    ultimoEm: e.ultimoEm,
    pendente: e.pendente,
    ultimoErro: e.ultimoErro,
    enviando: Boolean(enviando),
  };
}

/**
 * Envia o backup agora, sem perguntar nada.
 *
 * A ordem importa: o `backup-atual.json` vai **primeiro**. Se a rede cair
 * no meio, o que eu quero garantido é o arquivo mais recente; a cópia
 * diária é conveniência. E a rotação vem por último, depois de o arquivo
 * novo já estar gravado — apagar antes de ter o substituto é como se
 * perdem backups.
 *
 * @param {string} [motivo] só para o log e para a decisão de enviar
 * @returns {Promise<{ok: boolean, pendente?: boolean, erro?: string, bytes?: number}>}
 */
export async function fazerBackup(motivo = 'manual') {
  if (!conectado()) return { ok: false, erro: 'Não está conectado ao Dropbox.' };
  if (enviando) return enviando;

  enviando = executarBackup(motivo).finally(() => {
    enviando = null;
    avisar();
  });
  avisar();
  return await enviando;
}

/** O trabalho de verdade do `fazerBackup`. */
async function executarBackup(motivo) {
  try {
    const backup = await montarBackup();
    const conteudo = JSON.stringify(backup);
    const hoje = hojeIso();

    await enviar(ARQUIVO_ATUAL, conteudo);
    await enviar(caminhoDoDiario(hoje), conteudo);
    await rotacionarDiarios();

    salvarEstado({
      ultimoEm: new Date().toISOString(),
      pendente: false,
      ultimoErro: null,
    });
    return { ok: true, bytes: conteudo.length };
  } catch (erro) {
    if (erro instanceof SemInternet) {
      // Sem rede não é falha: é "depois eu mando".
      salvarEstado({ pendente: true, ultimoErro: null });
      console.info('[dropbox] sem internet, backup fica pendente (' + motivo + ')');
      return { ok: false, pendente: true };
    }
    salvarEstado({ pendente: true, ultimoErro: erro.message });
    console.warn('[dropbox] backup falhou:', erro);
    return { ok: false, erro: erro.message };
  }
}

/**
 * Mantém só as últimas cópias diárias, apagando as mais antigas.
 *
 * Falhar aqui não derruba o backup: o arquivo novo já está gravado, e
 * sobrar uma cópia velha a mais é muito menos grave do que o app dizer
 * que o backup falhou quando ele funcionou.
 */
async function rotacionarDiarios() {
  try {
    const entradas = await listar(PASTA_DIARIO);
    for (const velha of diariosParaApagar(entradas)) {
      await apagarArquivo(velha.caminho);
    }
  } catch (erro) {
    console.warn('[dropbox] não consegui limpar as cópias antigas:', erro);
  }
}

/**
 * Pede um backup por causa de uma alteração nos dados.
 *
 * Espera você parar de mexer (`DEBOUNCE_MS`) antes de mandar, e respeita
 * a espera mínima entre envios automáticos. Não devolve promessa de
 * propósito: quem salvou um alimento não deve ficar esperando a rede.
 *
 * @param {string} [motivo] `alteracao` (padrão) ou `sessao`
 */
export function agendarBackup(motivo = 'alteracao') {
  if (!conectado()) return;

  // Marca pendente **agora**, não quando o envio sair.
  //
  // O timer abaixo vive na memória da página, e no iPhone o app é
  // descartado a qualquer momento: mudar a rotação inteira e trocar de
  // app dez segundos depois matava o agendamento, e a alteração ficava
  // sem backup até a próxima sessão finalizada ou as 24 horas. Com a
  // marca no disco, a próxima abertura vê que há coisa a mandar.
  salvarEstado({ pendente: true });
  avisar();

  if (agendado) clearTimeout(agendado);
  agendado = setTimeout(
    () => dispararSeJaPode(motivo),
    motivo === 'sessao' ? 0 : DEBOUNCE_MS
  );
}

/**
 * Manda o backup se a espera mínima já passou; senão, remarca para
 * quando ela passar.
 *
 * Remarcar em vez de desistir importa: desistindo, uma alteração feita
 * logo após um backup só sairia na próxima abertura do app, mesmo com o
 * app aberto na sua frente a tarde inteira.
 *
 * @param {string} motivo
 */
function dispararSeJaPode(motivo) {
  agendado = null;
  const e = lerEstado();
  const agora = Date.now();

  if (devoEnviar({ motivo, ultimoEm: e.ultimoEm }, agora, ESPERA_ENTRE_BACKUPS_MS)) {
    fazerBackup(motivo);
    return;
  }

  const falta = ESPERA_ENTRE_BACKUPS_MS - (agora - Date.parse(e.ultimoEm));
  agendado = setTimeout(() => dispararSeJaPode(motivo), Math.max(falta, 1000));
}

/**
 * Sair do app com algo agendado tenta mandar antes de o iPhone
 * descartar a página.
 *
 * Não é garantia — o envio pode não terminar —, mas é de graça, e quando
 * termina evita que a alteração espere até a próxima abertura. O que
 * garante mesmo é a marca de pendente lá em cima.
 */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    if (!agendado || !conectado()) return;
    clearTimeout(agendado);
    agendado = null;
    fazerBackup('saindo');
  });
}

/**
 * Chamado na abertura do app.
 *
 * Duas tarefas da especificação num lugar só: mandar o que ficou pendente
 * e refazer o backup se o último passou de 24 horas. Nunca estoura para
 * fora — um Dropbox fora do ar não pode impedir o app de abrir.
 *
 * @returns {Promise<void>}
 */
export async function aoAbrirApp() {
  if (!conectado()) return;

  const e = lerEstado();
  const precisa = e.pendente || passouDoIntervalo(e.ultimoEm, Date.now(), INTERVALO_MS);
  if (!precisa) return;

  try {
    await fazerBackup(e.pendente ? 'pendente' : 'diario');
  } catch (erro) {
    console.warn('[dropbox] backup de abertura falhou:', erro);
  }
}

/**
 * Lista os backups guardados no Dropbox, para a tela de restauração.
 * @returns {Promise<{nome: string, caminho: string, modificadoEm: string, rotulo: string, atual: boolean}[]>}
 */
export async function listarBackups() {
  const [raiz, diarios] = await Promise.all([listar(''), listar(PASTA_DIARIO)]);
  const atual = raiz.filter((e) => '/' + e.nome === ARQUIVO_ATUAL);
  return ordenarParaRestaurar([...atual, ...diarios]);
}

/**
 * Baixa um backup do Dropbox sem gravar nada ainda.
 *
 * Separado do `restaurarDoDropbox` porque a tela precisa mostrar o que há
 * dentro do arquivo **antes** de pedir confirmação. Restaurar substitui os
 * dados locais; confirmar às cegas é como se perde um histórico.
 *
 * @param {string} caminho
 * @returns {Promise<Object>} o backup já validado
 */
export async function baixarBackup(caminho) {
  const texto = await baixar(caminho);

  let backup;
  try {
    backup = JSON.parse(texto);
  } catch {
    throw new Error('O arquivo no Dropbox não é um JSON válido.');
  }

  const validacao = validarBackup(backup);
  if (!validacao.ok) throw new Error(validacao.erro);
  return backup;
}

/**
 * Grava no banco um backup já baixado e confere se entrou mesmo.
 *
 * Reaproveita `restaurar` e `conferirRestauracao` — os mesmos do
 * "Importar JSON", inclusive a releitura do banco numa transação nova.
 *
 * @param {Object} backup vindo de `baixarBackup`
 * @returns {Promise<{gravados: Object, divergencias: string[]}>}
 */
export async function restaurarDoDropbox(backup) {
  const gravados = await restaurar(backup);
  const divergencias = await conferirRestauracao(backup);
  return { gravados, divergencias };
}
