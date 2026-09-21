/**
 * Exportar e importar (especificação, seção 6.8).
 *
 * O backup JSON varre **todas as stores do banco**, em vez de listar as
 * entidades uma a uma. Assim, quando a Etapa 6 acrescentar as stores da
 * dieta, elas entram no backup sozinhas — não dá para esquecer de incluir
 * uma entidade nova, que é o jeito clássico de um backup sair incompleto.
 *
 * No iPhone, baixar arquivo pelo navegador é limitado; por isso a
 * exportação tenta primeiro o menu de compartilhar do iOS (Web Share), que
 * permite salvar no app Arquivos, e cai no download comum quando não há.
 */

import { listarStores, lerTudo, transacao, VERSAO_DB } from '../data/db.js';
import { hojeIso } from '../utils/date.js';
import { mapaExercicios } from '../data/exercicios-repo.js';
import { listarSessoes } from '../data/sessoes-repo.js';
import { listarTodasSeries } from '../data/series-repo.js';
import { listarPesos } from '../data/peso-corporal-repo.js';
import { csvDeTreinos, csvDePeso, nomeDeArquivo } from '../domain/csv.js';

/** Identifica o formato do arquivo, para a importação validar. */
export const FORMATO = 'gymtracker-backup';

/* ------------------------------------------------------------------ */
/* Exportar                                                            */
/* ------------------------------------------------------------------ */

/**
 * Monta o backup completo: todas as stores do banco.
 * @returns {Promise<Object>}
 */
export async function montarBackup() {
  const stores = await listarStores();
  const dados = {};
  for (const store of stores) {
    dados[store] = await lerTudo(store);
  }
  return {
    formato: FORMATO,
    versaoDb: VERSAO_DB,
    exportadoEm: new Date().toISOString(),
    data: hojeIso(),
    dados,
  };
}

/**
 * Backup completo como texto JSON.
 * @returns {Promise<{nome: string, conteudo: string, tipo: string}>}
 */
export async function exportarJson() {
  const backup = await montarBackup();
  return {
    nome: nomeDeArquivo('gymtracker-backup', hojeIso(), 'json'),
    conteudo: JSON.stringify(backup, null, 2),
    tipo: 'application/json',
  };
}

/**
 * CSV dos treinos, uma linha por série.
 * @returns {Promise<{nome: string, conteudo: string, tipo: string}>}
 */
export async function exportarTreinosCsv() {
  const [sessoes, series, exercicios] = await Promise.all([
    listarSessoes(),
    listarTodasSeries(),
    mapaExercicios(),
  ]);
  return {
    nome: nomeDeArquivo('gymtracker-treinos', hojeIso(), 'csv'),
    conteudo: csvDeTreinos(sessoes, series, exercicios),
    tipo: 'text/csv',
  };
}

/**
 * CSV do peso corporal.
 * @returns {Promise<{nome: string, conteudo: string, tipo: string}>}
 */
export async function exportarPesoCsv() {
  return {
    nome: nomeDeArquivo('gymtracker-peso', hojeIso(), 'csv'),
    conteudo: csvDePeso(await listarPesos()),
    tipo: 'text/csv',
  };
}

/**
 * Entrega o arquivo ao usuário.
 *
 * No iPhone, o Web Share abre o menu do sistema e deixa salvar no app
 * Arquivos, que é o que a especificação pede. Quando não há Web Share (ou
 * o usuário cancela), cai no download comum do navegador.
 *
 * @param {{nome: string, conteudo: string, tipo: string}} arquivo
 * @returns {Promise<'compartilhado'|'baixado'|'cancelado'>}
 */
export async function entregar(arquivo) {
  const blob = new Blob([arquivo.conteudo], { type: arquivo.tipo });

  if (navigator.canShare) {
    const file = new File([blob], arquivo.nome, { type: arquivo.tipo });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: arquivo.nome });
        return 'compartilhado';
      } catch (erro) {
        // AbortError = o usuário fechou o menu; qualquer outro erro cai
        // no download, para não deixá-lo sem o arquivo.
        if (erro && erro.name === 'AbortError') return 'cancelado';
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = arquivo.nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'baixado';
}

/* ------------------------------------------------------------------ */
/* Importar                                                            */
/* ------------------------------------------------------------------ */

/**
 * Confere se um objeto parece mesmo um backup deste app.
 * @param {*} backup
 * @returns {{ok: boolean, erro?: string, resumo?: Object}}
 */
export function validarBackup(backup) {
  if (!backup || typeof backup !== 'object') {
    return { ok: false, erro: 'O arquivo não é um JSON de objeto.' };
  }
  if (backup.formato !== FORMATO) {
    return { ok: false, erro: 'Este arquivo não é um backup do GymTracker.' };
  }
  if (!backup.dados || typeof backup.dados !== 'object') {
    return { ok: false, erro: 'O backup não tem a seção de dados.' };
  }
  if (backup.versaoDb > VERSAO_DB) {
    return {
      ok: false,
      erro: `O backup é da versão ${backup.versaoDb} do banco e este app está na ${VERSAO_DB}. Atualize o app antes de restaurar.`,
    };
  }

  const resumo = {};
  Object.entries(backup.dados).forEach(([store, itens]) => {
    resumo[store] = Array.isArray(itens) ? itens.length : 0;
  });
  return { ok: true, resumo };
}

/**
 * Restaura um backup, substituindo os dados locais com segurança.
 * @param {Object} backup já validado
 * @returns {Promise<Object>} quantos registros por store
 */
export async function restaurar(backup) {
  const stores = await listarStores();
  const gravados = {};

  for (const store of stores) {
    // Se a store não existir no JSON, não limpa a tabela existente à toa
    if (!backup.dados || !(store in backup.dados)) {
      continue;
    }

    const itens = Array.isArray(backup.dados[store]) ? backup.dados[store] : [];

    await new Promise((resolve, reject) => {
      transacao(store, 'readwrite', (tx) => {
        const os = tx.objectStore(store);
        
        // 1. Limpa a tabela
        const clearReq = os.clear();

        clearReq.onsuccess = () => {
          if (itens.length === 0) return;

          // 2. Insere os itens do backup
          itens.forEach((item) => {
            const putReq = os.put(item);
            putReq.onerror = (e) => console.error(`Erro ao inserir na store ${store}:`, e.target.error);
          });
        };

        // 3. Só resolve a Promise quando O BANCO CONFIRMAR que salvou tudo no disco
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error || new Error(`Erro na transação da store ${store}`));
        tx.onabort = (e) => reject(e.target.error || new Error(`Transação abortada na store ${store}`));
      });
    });

    gravados[store] = itens.length;
  }

  return gravados;
}

/**
 * Esvazia **todas** as stores do banco.
 *
 * Usa a lista de stores do banco em vez de uma lista escrita na mão, pelo
 * mesmo motivo do backup: uma entidade nova acrescentada numa etapa futura
 * entra aqui sozinha, e não fica um resto de dado escondido depois de um
 * "apagar tudo".
 *
 * Quem chama é responsável por recarregar a carga inicial e a página.
 *
 * @returns {Promise<string[]>} as stores esvaziadas
 */
export async function apagarTudo() {
  const stores = await listarStores();
  for (const store of stores) {
    await transacao(store, 'readwrite', (tx) => {
      tx.objectStore(store).clear();
    });
  }
  return stores;
}

/**
 * Lê um arquivo escolhido pelo usuário e devolve o JSON.
 * @param {File} arquivo
 * @returns {Promise<Object>}
 */
export async function lerArquivo(arquivo) {
  const texto = await arquivo.text();
  return JSON.parse(texto);
}

/**
 * Abre o seletor de arquivos e devolve o escolhido.
 * @param {string} [accept]
 * @returns {Promise<File|null>}
 */
export function escolherArquivo(accept = 'application/json,.json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.onchange = () => {
      const arquivo = input.files && input.files[0];
      input.remove();
      resolve(arquivo ?? null);
    };
    document.body.appendChild(input);
    input.click();
  });
}
