/**
 * Acesso ao IndexedDB. Só este arquivo usa a API do banco.
 *
 * Cada versão do banco tem uma migração em `MIGRACOES`; ao abrir, rodam
 * todas desde a versão antiga, sem perder dados.
 */

/** Versão do banco. Subir ao mudar a estrutura. */
export const VERSAO_DB = 3;

const NOME_DB = 'gymtracker';

/**
 * Migrações; a chave é a versão de destino.
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
   * Aquecimento ganhou numeração própria (aq 1, aq 2).
   * Renumera as séries já gravadas; nenhuma é apagada.
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
            (a.ordemItem ?? 0) - (b.ordemItem ?? 0) || (a.numero ?? 0) - (b.numero ?? 0),
        )
        .forEach((serie) => {
          const grupo = `${serie.sessaoId}|${serie.itemId}|${
            serie.aquecimento ? 'aq' : 'ok'
          }`;
          const numero = (contadores.get(grupo) ?? 0) + 1;
          contadores.set(grupo, numero);
          if (numero !== serie.numero) store.put({ ...serie, numero });
        });
    };
  },

  /**
   * Stores da dieta. Só acrescenta, sem tocar no treino.
   * Refeições ficam fora dos planos porque uma refeição pode estar nos dois.
   */
  3(db) {
    db.createObjectStore('alimentos', { keyPath: 'id' });
    db.createObjectStore('pratos', { keyPath: 'id' });
    db.createObjectStore('refeicoes', { keyPath: 'id' });
    db.createObjectStore('planos', { keyPath: 'id' });

    // Plano escolhido em cada dia; chave AAAA-MM-DD.
    db.createObjectStore('tipoDia', { keyPath: 'data' });
  },
};

/** @type {Promise<IDBDatabase>|null} */
let conexao = null;

/** Abre a conexão (uma só, reaproveitada) e roda as migrações. */
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
      // O Safari fecha a conexão com o app parado em segundo plano.
      // Zerando aqui, a próxima chamada reabre.
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

/** IDBRequest em Promise. */
function promessa(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Roda `acao` dentro de uma transação.
 * @param {string|string[]} stores
 * @param {'readonly'|'readwrite'} modo
 * @param {(tx: IDBTransaction) => Promise<*>|*} acao
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

/** Abre a transação; se a conexão caiu (comum no iPhone), reabre e tenta de novo. */
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

export function lerTudo(store) {
  return transacao(store, 'readonly', (tx) => promessa(tx.objectStore(store).getAll()));
}

export function ler(store, chave) {
  return transacao(store, 'readonly', (tx) => promessa(tx.objectStore(store).get(chave)));
}

/** Registros de um índice com um valor exato. */
export function lerPorIndice(store, indice, valor) {
  return transacao(
    store,
    'readonly',
    (tx) => promessa(tx.objectStore(store).index(indice).getAll(valor)),
  );
}

/** Insere ou substitui um registro. */
export function gravar(store, registro) {
  return transacao(
    store,
    'readwrite',
    (tx) => promessa(tx.objectStore(store).put(registro)),
  );
}

/** Grava vários registros numa transação. */
export function gravarVarios(store, registros) {
  return transacao(store, 'readwrite', (tx) => {
    const os = tx.objectStore(store);
    registros.forEach((r) => os.put(r));
  });
}

export function apagar(store, chave) {
  return transacao(
    store,
    'readwrite',
    (tx) => promessa(tx.objectStore(store).delete(chave)),
  );
}

/** Apaga todos os registros de uma store. */
export function limpar(store) {
  return transacao(store, 'readwrite', (tx) => promessa(tx.objectStore(store).clear()));
}

export function contar(store) {
  return transacao(store, 'readonly', (tx) => promessa(tx.objectStore(store).count()));
}

/** Nomes de todas as stores (usado no backup). */
export async function listarStores() {
  const db = await abrirDb();
  return Array.from(db.objectStoreNames);
}
