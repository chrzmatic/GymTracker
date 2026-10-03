/**
 * Backup automático: quando enviar, o que manter e como restaurar.
 *
 * Montar e restaurar o backup fica em services/backup-service.js (o mesmo
 * do Exportar/Importar JSON). Aqui é só o transporte.
 *
 * Sem rede, o envio fica `pendente` e sai na próxima oportunidade.
 * Guarda só que há algo pendente; o backup é sempre o banco inteiro.
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

/** Quem quer saber quando o estado muda. */
const ouvintes = new Set();

/** Envio em andamento, para não mandar dois ao mesmo tempo. */
let enviando = null;

/** Timer do debounce. */
let agendado = null;

/**
 * Registra um ouvinte.
 * @returns {Function} para parar de ouvir
 */
export function aoMudar(ouvinte) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** Chama os ouvintes com o estado atual. */
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
 * Estado para as telas.
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
 * Envia o backup agora.
 * Ordem: backup-atual.json, cópia do dia e só depois apaga as antigas.
 * @param {string} [motivo]
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

/** O trabalho do `fazerBackup`. */
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
      // Sem rede: fica pendente.
      salvarEstado({ pendente: true, ultimoErro: null });
      console.info('[dropbox] sem internet, backup fica pendente (' + motivo + ')');
      return { ok: false, pendente: true };
    }
    salvarEstado({ pendente: true, ultimoErro: erro.message });
    console.warn('[dropbox] backup falhou:', erro);
    return { ok: false, erro: erro.message };
  }
}

/** Mantém só as últimas cópias diárias. Falhar aqui não derruba o backup. */
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
 * Pede backup depois de uma alteração.
 * Espera você parar de mexer e respeita a espera mínima. Não espera a rede.
 * @param {string} [motivo] `alteracao` (padrão) ou `sessao`
 */
export function agendarBackup(motivo = 'alteracao') {
  if (!conectado()) return;

  // Marca pendente já, no disco: no iPhone o app pode ser descartado
  // antes do timer disparar.
  salvarEstado({ pendente: true });
  avisar();

  if (agendado) clearTimeout(agendado);
  agendado = setTimeout(
    () => dispararSeJaPode(motivo),
    motivo === 'sessao' ? 0 : DEBOUNCE_MS
  );
}

/** Envia se a espera mínima já passou; senão, remarca. */
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

/** Ao sair do app com envio agendado, tenta mandar antes. */
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
 * Na abertura: envia o pendente e refaz o backup se passou de 24h.
 * Nunca lança erro: o Dropbox fora do ar não pode impedir o app de abrir.
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
 * Backups no Dropbox, para a tela de restauração.
 * @returns {Promise<{nome: string, caminho: string, modificadoEm: string, rotulo: string, atual: boolean}[]>}
 */
export async function listarBackups() {
  const [raiz, diarios] = await Promise.all([listar(''), listar(PASTA_DIARIO)]);
  const atual = raiz.filter((e) => '/' + e.nome === ARQUIVO_ATUAL);
  return ordenarParaRestaurar([...atual, ...diarios]);
}

/**
 * Baixa e valida um backup sem gravar, para a tela mostrar o conteúdo antes de confirmar.
 * @returns {Promise<Object>} o backup validado
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
 * Grava um backup baixado e confere se entrou inteiro.
 * @param {Object} backup vindo de `baixarBackup`
 * @returns {Promise<{gravados: Object, divergencias: string[]}>}
 */
export async function restaurarDoDropbox(backup) {
  const gravados = await restaurar(backup);
  const divergencias = await conferirRestauracao(backup);
  return { gravados, divergencias };
}
