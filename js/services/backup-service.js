/**
 * Exportar e importar.
 *
 * O backup JSON leva todas as stores do banco, então uma store nova entra sozinha.
 * No iPhone, a exportação usa o menu de compartilhar (para salvar no Arquivos);
 * sem ele, faz download comum.
 */

import { contar, lerTudo, listarStores, transacao, VERSAO_DB } from '../data/db.js';
import { hojeIso } from '../utils/date.js';
import { mapaExercicios } from '../data/exercicios-repo.js';
import { listarSessoes } from '../data/sessoes-repo.js';
import { listarTodasSeries } from '../data/series-repo.js';
import { listarPesos } from '../data/peso-corporal-repo.js';
import { csvDePeso, csvDeTreinos, nomeDeArquivo } from '../domain/csv.js';

/** Marca do formato, conferida ao importar. */
export const FORMATO = 'gymtracker-backup';

/** Nome legível de cada store. As que não estão aqui aparecem com o nome técnico. */
const NOMES = {
  musculos: 'músculos',
  exercicios: 'exercícios',
  treinos: 'treinos',
  sessoes: 'sessões de treino',
  series: 'séries registradas',
  pesoCorporal: 'pesos corporais',
  config: 'configurações',
  alimentos: 'alimentos',
  pratos: 'pratos',
  refeicoes: 'refeições',
  planos: 'planos de dieta',
  tipoDia: 'dias marcados',
};

function quantos(backup, store) {
  const itens = backup && backup.dados ? backup.dados[store] : null;
  return Array.isArray(itens) ? itens.length : 0;
}

/**
 * Resumo do que o backup tem, com o histórico primeiro.
 * Um backup de instalação nova parece cheio, mas só tem os dados padrão.
 */
export function descreverBackup(backup) {
  const sessoes = quantos(backup, 'sessoes');
  const pesos = quantos(backup, 'pesoCorporal');
  const total = Object.values(backup.dados ?? {}).reduce(
    (soma, itens) => soma + (Array.isArray(itens) ? itens.length : 0),
    0,
  );

  const partes = [
    sessoes === 0
      ? 'NENHUMA sessão de treino'
      : `${sessoes} ${sessoes === 1 ? 'sessão' : 'sessões'} de treino`,
  ];
  if (pesos) partes.push(`${pesos} ${pesos === 1 ? 'peso' : 'pesos'}`);
  partes.push(`${total} registros no total`);
  return partes.join(', ');
}

/**
 * O que o app tem hoje e o backup não tem (some ao restaurar).
 * @returns {Promise<string[]>} ex.: ['sessões de treino: 27 → 0']
 */
export async function perdasAoRestaurar(backup) {
  const stores = (await listarStores()).filter((s) => Array.isArray(backup.dados[s]));
  const perdas = [];

  for (const store of stores) {
    const noBanco = await contar(store);
    const noArquivo = backup.dados[store].length;
    if (noBanco > noArquivo) {
      perdas.push(`${NOMES[store] ?? store}: ${noBanco} → ${noArquivo}`);
    }
  }

  return perdas;
}

/* --- Exportar --- */

/** Backup completo: todas as stores. */
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
 * Backup como arquivo JSON.
 * @returns {Promise<{nome: string, conteudo: string, tipo: string}>}
 */
export async function exportarJson() {
  const backup = await montarBackup();
  return {
    nome: nomeDeArquivo('gymtracker-backup', hojeIso(), 'json'),
    conteudo: JSON.stringify(backup, null, 2),
    tipo: 'application/json',
    resumo: descreverBackup(backup),
    vazio: quantos(backup, 'sessoes') === 0,
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
 * Entrega o arquivo: menu de compartilhar se houver, senão download.
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
        // AbortError = o usuário fechou o menu. Outro erro cai no download.
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

/* --- Importar --- */

/**
 * Confere se o objeto é um backup deste app.
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
      erro:
        `O backup é da versão ${backup.versaoDb} do banco e este app está na ${VERSAO_DB}. Atualize o app antes de restaurar.`,
    };
  }

  const resumo = {};
  Object.entries(backup.dados).forEach(([store, itens]) => {
    resumo[store] = Array.isArray(itens) ? itens.length : 0;
  });
  return { ok: true, resumo };
}

/**
 * Restaura um backup, substituindo os dados (mesclar criaria duplicatas).
 *
 * Tudo numa transação só: ou entra tudo, ou nada.
 * Stores que o backup não traz ficam como estão.
 * @param {Object} backup já validado
 * @returns {Promise<Object>} registros por store
 */
export async function restaurar(backup) {
  const stores = (await listarStores()).filter((s) => Array.isArray(backup.dados[s]));
  if (!stores.length) {
    throw new Error('O backup não traz nenhuma tabela que este app conheça.');
  }

  await transacao(stores, 'readwrite', (tx) => {
    stores.forEach((store) => {
      const os = tx.objectStore(store);
      os.clear();
      backup.dados[store].forEach((item) => os.put(item));
    });
  });

  const gravados = {};
  stores.forEach((store) => {
    gravados[store] = backup.dados[store].length;
  });
  return gravados;
}

/**
 * Relê o banco e confere se o backup entrou inteiro.
 * @returns {Promise<string[]>} divergências; vazia = tudo certo
 */
export async function conferirRestauracao(backup) {
  const stores = (await listarStores()).filter((s) => Array.isArray(backup.dados[s]));
  const divergencias = [];

  for (const store of stores) {
    const noBanco = await contar(store);
    const noArquivo = backup.dados[store].length;
    if (noBanco !== noArquivo) {
      divergencias.push(store + ': ' + noBanco + ' de ' + noArquivo);
    }
  }

  return divergencias;
}

/**
 * Esvazia todas as stores. Quem chama recarrega os dados padrão e a tela.
 * @returns {Promise<string[]>} as stores esvaziadas
 */
export async function apagarTudo() {
  const stores = await listarStores();
  // Uma transação só: ou apaga tudo, ou nada.
  await transacao(stores, 'readwrite', (tx) => {
    stores.forEach((store) => tx.objectStore(store).clear());
  });
  return stores;
}

/** Lê o JSON de um arquivo escolhido. */
export async function lerArquivo(arquivo) {
  const texto = await arquivo.text();
  return JSON.parse(texto);
}

/**
 * Abre o seletor de arquivos.
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
