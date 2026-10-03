/**
 * Chamadas à API do Dropbox: enviar, baixar, listar e apagar arquivos.
 * Todo caminho é relativo à pasta do app no Dropbox.
 *
 * Um 401 renova o token e tenta de novo uma vez.
 * Falta de rede vira `SemInternet`: o backup fica pendente em vez de dar erro.
 */

import { API_RPC, API_CONTEUDO } from './dropbox-config.js';
import { tokenValido } from './dropbox-auth.js';

/** Falha de rede. O backup fica pendente em vez de dar erro. */
export class SemInternet extends Error {
  constructor(causa) {
    super('Sem conexão com a internet.');
    this.name = 'SemInternet';
    this.causa = causa;
  }
}

/** O header `Dropbox-API-Arg` só aceita ASCII: escapa acentos. */
function argHttp(arg) {
  return JSON.stringify(arg).replace(/[\u007f-￿]/g, (c) => {
    return '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
  });
}

/**
 * Faz a requisição com o token atual; num 401, renova e repete.
 * @param {(token: string) => Promise<Response>} montar
 */
async function comToken(montar) {
  let resposta;
  try {
    resposta = await montar(await tokenValido());
  } catch (erro) {
    // TypeError aqui = a requisição nem saiu (sem rede).
    if (erro instanceof TypeError) throw new SemInternet(erro);
    throw erro;
  }

  if (resposta.status === 401) {
    try {
      resposta = await montar(await tokenValido(true));
    } catch (erro) {
      if (erro instanceof TypeError) throw new SemInternet(erro);
      throw erro;
    }
  }
  return resposta;
}

/** Resposta de erro para um Error com mensagem legível. */
async function erroDaResposta(resposta) {
  const texto = await resposta.text().catch(() => '');

  if (/missing_scope/.test(texto)) {
    return new Error(
      'O app no Dropbox não tem permissão para gravar arquivos. Marque files.content.write e files.content.read na aba Permissions e conecte de novo.'
    );
  }
  if (/insufficient_space/.test(texto)) {
    return new Error('Não há espaço livre no seu Dropbox.');
  }
  return new Error('O Dropbox recusou (' + resposta.status + '): ' + texto.slice(0, 200));
}

/**
 * Chamada RPC comum.
 * @param {string} endpoint ex.: `files/list_folder`
 * @param {Object|null} corpo `null` manda corpo vazio
 */
export async function chamar(endpoint, corpo) {
  const resposta = await comToken((token) => {
    const headers = { Authorization: 'Bearer ' + token };
    if (corpo !== null) headers['Content-Type'] = 'application/json';
    return fetch(API_RPC + '/' + endpoint, {
      method: 'POST',
      headers,
      body: corpo === null ? null : JSON.stringify(corpo),
    });
  });

  if (!resposta.ok) throw await erroDaResposta(resposta);
  const texto = await resposta.text();
  return texto ? JSON.parse(texto) : {};
}

/**
 * Envia ou sobrescreve um arquivo de texto.
 * `overwrite` evita cópias como `backup-atual (1).json`.
 * @param {string} caminho ex.: `/backup-atual.json`
 * @returns {Promise<Object>} metadados do arquivo
 */
export async function enviar(caminho, conteudo) {
  const resposta = await comToken((token) =>
    fetch(API_CONTEUDO + '/files/upload', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': argHttp({
          path: caminho,
          mode: 'overwrite',
          mute: true,
        }),
      },
      body: new Blob([conteudo], { type: 'application/octet-stream' }),
    })
  );

  if (!resposta.ok) throw await erroDaResposta(resposta);
  return resposta.json();
}

/** Baixa um arquivo e devolve o texto. */
export async function baixar(caminho) {
  const resposta = await comToken((token) =>
    fetch(API_CONTEUDO + '/files/download', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Dropbox-API-Arg': argHttp({ path: caminho }),
      },
    })
  );

  if (!resposta.ok) throw await erroDaResposta(resposta);
  return resposta.text();
}

/**
 * Arquivos de uma pasta. Pasta inexistente devolve lista vazia.
 * @param {string} pasta `''` para a raiz
 * @returns {Promise<{nome: string, caminho: string, modificadoEm: string, tamanho: number}[]>}
 */
export async function listar(pasta) {
  let resposta;
  try {
    resposta = await chamar('files/list_folder', {
      path: pasta,
      recursive: false,
      limit: 100,
    });
  } catch (erro) {
    if (/not_found/.test(erro.message)) return [];
    throw erro;
  }

  const entradas = [];
  let pagina = resposta;
  for (;;) {
    pagina.entries
      .filter((e) => e['.tag'] === 'file')
      .forEach((e) =>
        entradas.push({
          nome: e.name,
          caminho: e.path_lower,
          modificadoEm: e.server_modified,
          tamanho: e.size,
        })
      );
    if (!pagina.has_more) break;
    pagina = await chamar('files/list_folder/continue', { cursor: pagina.cursor });
  }
  return entradas;
}

/** Apaga um arquivo. Se ele já não existe, não é erro. */
export async function apagarArquivo(caminho) {
  try {
    await chamar('files/delete_v2', { path: caminho });
  } catch (erro) {
    if (/not_found/.test(erro.message)) return;
    throw erro;
  }
}
