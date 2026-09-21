/**
 * Acesso ao IndexedDB.
 *
 * Esta é a única parte do app que conhece a API do IndexedDB. Ela expõe
 * helpers de leitura e escrita por store; os repositórios (um por entidade)
 * usam esses helpers e os serviços usam os repositórios.
 *
 * Evolução do banco: cada versão tem uma migração própria na lista
 * `MIGRACOES`. Ao abrir, o IndexedDB roda todas as migrações da versão antiga
 * até a atual, preservando os dados já gravados.
 */

/** Versão atual do banco. Incrementar sempre que mudar a estrutura. */
export const VERSAO_DB = 3;

const NOME_DB = 'gymtracker';

/**
 * Migrações por versão. O índice é o número da versão de destino.
 * Cada função recebe o IDBDatabase e a transação de upgrade.
 * @type {Object<number, (db: IDBDatabase, tx: IDBTransaction) => void>}
 */
const MIGRACOES = {
  1(db) {
    db.createObjectStore('musculos', { keyPath: 'id' });

    db.createObjectStore('exercicios', { keyPath: 'id' });

    db.createObjectStore('treinos', { keyPath: 'id' });

    const sessoes = db.createObjectStore('sessoes', { keyPath: 'id' });
    sessoes.createIndex('data', 'data');
    sessoes.createIndex('status', 'status');
    sessoes.createIndex('treinoId', 'treinoId');

    const series = db.createObjectStore('series', { keyPath: 'id' });
    series.createIndex('sessaoId', 'sessaoId');
    series.createIndex('exercicioId', 'exercicioId');

    const pesos = db.createObjectStore('pesoCorporal', { keyPath: 'id' });
    pesos.createIndex('data', 'data');

    db.createObjectStore('config', { keyPath: 'chave' });
  },

  /**
   * Aquecimento virou categoria com numeração própria: aq 1, aq 2 à parte
   * das séries valendo 1, 2, 3. Antes tudo dividia a mesma sequência, então
   * as séries já gravadas precisam ser renumeradas dentro de cada grupo
   * (sessão + item + aquecimento). Nenhuma série é apagada, só o campo
   * `numero` muda.
   */
  2(_db, tx) {
    const store = tx.objectStore('series');
    store.getAll().onsuccess = (evento) => {
      const series = evento.target.result ?? [];
      const contadores = new Map();
      series
        .slice()
        .sort(
          (a, b) =>
            (a.ordemItem ?? 0) - (b.ordemItem ?? 0) || (a.numero ?? 0) - (b.numero ?? 0)
        )
        .forEach((serie) => {
          const grupo = `${serie.sessaoId}|${serie.itemId}|${serie.aquecimento ? 'aq' : 'ok'}`;
          const numero = (contadores.get(grupo) ?? 0) + 1;
          contadores.set(grupo, numero);
          if (numero !== serie.numero) store.put({ ...serie, numero });
        });
    };
  },

  /**
   * Stores da dieta (Etapa 6). Só acrescenta: nada do treino é tocado,
   * então quem já estava usando o app não perde nada.
   *
   * `refeicoes` fica separada de `planos` porque uma refeição pode ser
   * compartilhada entre os dois planos — o jantar é o mesmo no dia de
   * treino e no dia sem treino, e editar uma vez tem que valer para os
   * dois. Se a refeição morasse dentro do plano, haveria duas cópias.
   */
  3(db) {
    db.createObjectStore('alimentos', { keyPath: 'id' });
    db.createObjectStore('pratos', { keyPath: 'id' });
    db.createObjectStore('refeicoes', { keyPath: 'id' });
    db.createObjectStore('planos', { keyPath: 'id' });

    // Qual plano vale em cada dia. Chave é a data AAAA-MM-DD, porque a
    // escolha ("hoje vou seguir o plano de treino") é por dia.
    db.createObjectStore('tipoDia', { keyPath: 'data' });
  },
};

/** @type {Promise<IDBDatabase>|null} */
let conexao = null;

/**
 * Abre (e guarda) a conexão com o banco, rodando as migrações necessárias.
 * @returns {Promise<IDBDatabase>}
 */
export function abrirDb() {
  if (conexao) return conexao;

  const promessaAtual = new Promise((resolve, reject) => {
    const req = indexedDB.open(NOME_DB, VERSAO_DB);

    req.onupgradeneeded = (evento) => {
      const db = req.result;
      const tx = req.transaction;
      const de = evento.oldVersion;
      for (let v = de + 1; v <= VERSAO_DB; v += 1) {
        const migracao = MIGRACOES[v];
        if (migracao) migracao(db, tx);
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      // O Safari do iPhone fecha a conexão por conta própria quando o app
      // fica parado em segundo plano. Sem soltar o cache aqui, a próxima
      // escrita cairia num `InvalidStateError` — ou pior, numa transação
      // que aborta em silêncio. Zerando, a próxima chamada reabre.
      db.onclose = () => {
        if (conexao === promessaAtual) conexao = null;
      };
      db.onversionchange = () => {
        db.close();
        if (conexao === promessaAtual) conexao = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () =>
      reject(new Error('Banco bloqueado por outra aba aberta do app.'));
  });

  conexao = promessaAtual;
  return conexao;
}

/**
 * Envolve uma IDBRequest numa Promise.
 * @param {IDBRequest} req
 * @returns {Promise<*>}
 */
function promessa(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Executa uma operação dentro de uma transação.
 * @param {string|string[]} stores
 * @param {'readonly'|'readwrite'} modo
 * @param {(tx: IDBTransaction) => Promise<*>|*} acao
 * @returns {Promise<*>}
 */
export async function transacao(stores, modo, acao) {
  const tx = await abrirTransacao(stores, modo);
  return new Promise((resolve, reject) => {
    let resultado;
    tx.oncomplete = () => resolve(resultado);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    Promise.resolve(acao(tx))
      .then((r) => {
        resultado = r;
      })
      .catch((erro) => {
        try {
          tx.abort();
        } catch {
          /* transação já encerrada */
        }
        reject(erro);
      });
  });
}

/**
 * Abre a transação, reabrindo o banco se a conexão tiver caído.
 *
 * Vale a pena a tentativa extra porque a conexão cai justamente no pior
 * momento: o iPhone descarta o app em segundo plano enquanto você escolhe
 * o arquivo de backup no app Arquivos, e a primeira escrita ao voltar
 * encontraria uma conexão morta.
 *
 * @param {string|string[]} stores
 * @param {'readonly'|'readwrite'} modo
 * @returns {Promise<IDBTransaction>}
 */
async function abrirTransacao(stores, modo) {
  const db = await abrirDb();
  try {
    return db.transaction(stores, modo);
  } catch (erro) {
    if (!erro || erro.name !== 'InvalidStateError') throw erro;
    conexao = null;
    return (await abrirDb()).transaction(stores, modo);
  }
}

/**
 * Lê todos os registros de uma store.
 * @param {string} store
 * @returns {Promise<Object[]>}
 */
export function lerTudo(store) {
  return transacao(store, 'readonly', (tx) =>
    promessa(tx.objectStore(store).getAll())
  );
}

/**
 * Lê um registro pela chave primária.
 * @param {string} store
 * @param {IDBValidKey} chave
 * @returns {Promise<Object|undefined>}
 */
export function ler(store, chave) {
  return transacao(store, 'readonly', (tx) =>
    promessa(tx.objectStore(store).get(chave))
  );
}

/**
 * Lê todos os registros de um índice com um valor exato.
 * @param {string} store
 * @param {string} indice
 * @param {IDBValidKey|IDBKeyRange} valor
 * @returns {Promise<Object[]>}
 */
export function lerPorIndice(store, indice, valor) {
  return transacao(store, 'readonly', (tx) =>
    promessa(tx.objectStore(store).index(indice).getAll(valor))
  );
}

/**
 * Grava (insere ou substitui) um registro.
 * @param {string} store
 * @param {Object} registro
 * @returns {Promise<IDBValidKey>}
 */
export function gravar(store, registro) {
  return transacao(store, 'readwrite', (tx) =>
    promessa(tx.objectStore(store).put(registro))
  );
}

/**
 * Grava vários registros numa única transação.
 * @param {string} store
 * @param {Object[]} registros
 * @returns {Promise<void>}
 */
export function gravarVarios(store, registros) {
  return transacao(store, 'readwrite', (tx) => {
    const os = tx.objectStore(store);
    registros.forEach((r) => os.put(r));
  });
}

/**
 * Apaga um registro pela chave.
 * @param {string} store
 * @param {IDBValidKey} chave
 * @returns {Promise<void>}
 */
export function apagar(store, chave) {
  return transacao(store, 'readwrite', (tx) =>
    promessa(tx.objectStore(store).delete(chave))
  );
}

/**
 * Apaga todos os registros de uma store.
 * @param {string} store
 * @returns {Promise<void>}
 */
export function limpar(store) {
  return transacao(store, 'readwrite', (tx) =>
    promessa(tx.objectStore(store).clear())
  );
}

/**
 * Conta os registros de uma store. Usado para saber se o banco está vazio.
 * @param {string} store
 * @returns {Promise<number>}
 */
export function contar(store) {
  return transacao(store, 'readonly', (tx) =>
    promessa(tx.objectStore(store).count())
  );
}

/**
 * Lista os nomes de todas as stores do banco atual.
 * Usado pelo export/backup completo.
 * @returns {Promise<string[]>}
 */
export async function listarStores() {
  const db = await abrirDb();
  return Array.from(db.objectStoreNames);
}
