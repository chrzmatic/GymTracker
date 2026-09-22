/**
 * Regras do backup que não dependem de rede nem de banco.
 *
 * Estão separadas pelo mesmo motivo da camada `domain`: são elas que
 * decidem o que **apagar**, e uma conta errada aqui não dá erro na tela —
 * apaga o backup de ontem calado. Isoladas, dá para provar cada caso com
 * teste (`tests/dropbox.test.js`) sem subir nada para o Dropbox.
 */

import { PASTA_DIARIO, MAX_DIARIOS, INTERVALO_MS } from './dropbox-config.js';

/** Formato dos nomes de cópia diária: `backup-AAAA-MM-DD.json`. */
const PADRAO_DIARIO = /^backup-(\d{4}-\d{2}-\d{2})\.json$/;

/**
 * Caminho da cópia diária de uma data.
 * @param {string} iso data `AAAA-MM-DD`
 * @returns {string}
 */
export function caminhoDoDiario(iso) {
  return PASTA_DIARIO + '/backup-' + iso + '.json';
}

/**
 * Extrai a data do nome de uma cópia diária.
 * @param {string} nome
 * @returns {string|null} `AAAA-MM-DD`, ou null se o nome não for de diário
 */
export function dataDoDiario(nome) {
  const m = PADRAO_DIARIO.exec(String(nome || ''));
  return m ? m[1] : null;
}

/**
 * Quais cópias diárias apagar para sobrar no máximo `maximo`.
 *
 * Ordena pela data **do nome**, não pela data de modificação do arquivo:
 * restaurar um backup e mandar um novo logo em seguida mexe nos horários
 * do Dropbox, e aí o "mais antigo" pelo horário pode ser justamente o de
 * hoje. O nome carrega o dia a que o backup se refere, que é o que
 * importa para decidir o que perder.
 *
 * Arquivos que não seguem o padrão do nome nunca são apagados — se eu
 * largar qualquer coisa nessa pasta, o app não mexe.
 *
 * @param {{nome: string, caminho: string}[]} entradas o conteúdo de /diario
 * @param {number} [maximo]
 * @returns {{nome: string, caminho: string}[]} as que sobram para apagar
 */
export function diariosParaApagar(entradas, maximo = MAX_DIARIOS) {
  const diarios = (entradas || [])
    .filter((e) => dataDoDiario(e.nome))
    .sort((a, b) => dataDoDiario(b.nome).localeCompare(dataDoDiario(a.nome)));

  return diarios.slice(maximo);
}

/**
 * Já passou tempo demais desde o último backup?
 *
 * Nunca ter feito backup conta como "passou": é a primeira abertura
 * depois de conectar, e é justamente aí que o backup mais falta.
 *
 * @param {string|null} ultimoEm ISO do último backup bem-sucedido
 * @param {number} [agora] epoch ms
 * @param {number} [intervalo] ms
 * @returns {boolean}
 */
export function passouDoIntervalo(ultimoEm, agora = Date.now(), intervalo = INTERVALO_MS) {
  if (!ultimoEm) return true;
  const quando = Date.parse(ultimoEm);
  if (Number.isNaN(quando)) return true;
  return agora - quando >= intervalo;
}

/**
 * Decide se um backup deve mesmo sair agora.
 *
 * O motivo pesa: `manual` e `sessao` (fim de treino) vão sempre, porque
 * são momentos em que eu quero a garantia. `alteracao` respeita a espera
 * mínima — senão editar cinco alimentos seguidos mandaria o banco inteiro
 * cinco vezes pela rede.
 *
 * **Estar pendente não fura a espera.** Pendente hoje quer dizer "há
 * alteração não enviada", e isso vale para toda alteração desde o
 * instante em que ela é agendada — se furasse a fila, a espera mínima
 * não valeria para nada. Quem cuida do pendente é a abertura do app
 * (`aoAbrirApp`) e o reagendamento de `dispararSeJaPode`.
 *
 * @param {{motivo: string, ultimoEm: string|null}} situacao
 * @param {number} agora epoch ms
 * @param {number} espera ms entre dois backups automáticos
 * @returns {boolean}
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
 * Ordena os backups disponíveis para a tela de restauração: o
 * `backup-atual.json` primeiro, depois os diários do mais novo ao mais
 * velho.
 *
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
