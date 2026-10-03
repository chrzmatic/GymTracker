/** Regras puras do backup (o que manter e quando enviar), testadas em tests/dropbox.test.js. */

import { PASTA_DIARIO, MAX_DIARIOS, INTERVALO_MS } from './dropbox-config.js';

/** Nome das cópias diárias: `backup-AAAA-MM-DD.json`. */
const PADRAO_DIARIO = /^backup-(\d{4}-\d{2}-\d{2})\.json$/;

/** Caminho da cópia diária de uma data AAAA-MM-DD. */
export function caminhoDoDiario(iso) {
  return PASTA_DIARIO + '/backup-' + iso + '.json';
}

/** Data (AAAA-MM-DD) do nome de uma cópia diária, ou null. */
export function dataDoDiario(nome) {
  const m = PADRAO_DIARIO.exec(String(nome || ''));
  return m ? m[1] : null;
}

/**
 * Cópias diárias a apagar para sobrar no máximo `maximo`.
 * Ordena pela data do nome, não pela de modificação.
 * Arquivos fora do padrão nunca são apagados.
 * @param {{nome: string, caminho: string}[]} entradas
 * @param {number} [maximo]
 */
export function diariosParaApagar(entradas, maximo = MAX_DIARIOS) {
  const diarios = (entradas || [])
    .filter((e) => dataDoDiario(e.nome))
    .sort((a, b) => dataDoDiario(b.nome).localeCompare(dataDoDiario(a.nome)));

  return diarios.slice(maximo);
}

/**
 * true se passou do intervalo desde o último backup (ou se nunca houve).
 * @param {string|null} ultimoEm ISO
 * @param {number} [agora] epoch ms
 * @param {number} [intervalo] ms
 */
export function passouDoIntervalo(ultimoEm, agora = Date.now(), intervalo = INTERVALO_MS) {
  if (!ultimoEm) return true;
  const quando = Date.parse(ultimoEm);
  if (Number.isNaN(quando)) return true;
  return agora - quando >= intervalo;
}

/**
 * Decide se o backup sai agora.
 * `manual` e `sessao` sempre saem; `alteracao` respeita a espera mínima,
 * mesmo havendo pendente.
 * @param {{motivo: string, ultimoEm: string|null}} situacao
 * @param {number} agora epoch ms
 * @param {number} espera ms
 */
export function devoEnviar(situacao, agora, espera) {
  const { motivo, ultimoEm } = situacao;
  if (motivo === 'manual' || motivo === 'sessao') return true;
  if (!ultimoEm) return true;

  const quando = Date.parse(ultimoEm);
  if (Number.isNaN(quando)) return true;
  return agora - quando >= espera;
}

/**
 * Ordem da tela de restauração: backup-atual.json, depois os diários do mais novo ao mais velho.
 * @param {{nome: string, caminho: string, modificadoEm: string}[]} entradas
 * @returns {{nome: string, caminho: string, modificadoEm: string, rotulo: string, atual: boolean}[]}
 */
export function ordenarParaRestaurar(entradas) {
  const lista = (entradas || []).map((e) => {
    const data = dataDoDiario(e.nome);
    return {
      ...e,
      atual: !data,
      rotulo: data ? data : 'Backup mais recente',
      chave: data || '9999-99-99',
    };
  });

  lista.sort((a, b) => {
    if (a.atual !== b.atual) return a.atual ? -1 : 1;
    return b.chave.localeCompare(a.chave);
  });

  return lista.map(({ chave: _chave, ...resto }) => resto);
}
