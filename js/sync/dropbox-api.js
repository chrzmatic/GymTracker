/**
 * Chamadas à API do Dropbox: enviar, baixar, listar e apagar arquivos.
 *
 * Só o que o backup precisa. A pasta é a do app ("App folder"), então todo
 * caminho aqui é relativo a ela — o app não enxerga, e não consegue
 * estragar, nada do resto do Dropbox.
 *
 * ## Duas coisas que esta camada resolve para quem chama
 *
 * **Token vencido.** Um 401 significa quase sempre que o access token
 * expirou no meio do caminho. Em vez de devolver o erro para a tela, a
 * chamada renova o token e tenta de novo, uma vez. Só a segunda recusa
 * vira erro de verdade.
 *
 * **Falta de internet é diferente de erro.** `fetch` estourar por falta de
 * rede vira `SemInternet`, e o backup trata isso como "fica pendente,
 * mando depois". Um 409 do Dropbox, esse sim é um problema para contar ao
 * usuário. Misturar os dois transformaria cada treino no subsolo da
 * academia num aviso vermelho de erro.
 */

import { API_RPC, API_CONTEUDO } from './dropbox-config.js';
import { tokenValido } from './dropbox-auth.js';

/** Falha de rede, não do Dropbox. O backup vira pendente em vez de erro. */
export class SemInternet extends Error {
  constructor(causa) {
    super('Sem conexão com a internet.');
    this.name = 'SemInternet';
    this.causa = causa;
  }
}

/**
 * O header `Dropbox-API-Arg` só aceita ASCII, e nomes de arquivo com
 * acento apareceriam aqui se eu deixasse. Escapa o que passar de 0x7F.
 * @param {Object} arg
 * @returns {string}
 */
function argHttp(arg) {
  return JSON.stringify(arg).replace(/[\u007f-￿]/g, (c) => {
    return '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
  });
}

/**
 * Faz a requisição com o token atual, renovando e repetindo num 401.
 * @param {(token: string) => Promise<Response>} montar
 * @returns {Promise<Response>}
 */
async function comToken(montar) {
  let resposta;
  try {
    resposta = await montar(await tokenValido());
  } catch (erro) {
    // `fetch` só estoura assim quando a requisição não chegou a sair.
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

/**
 * Transforma uma resposta ruim em erro com mensagem legível.
 * @param {Response} resposta
 * @returns {Promise<Error>}
 */
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
 * Chamada RPC comum (a maioria dos endpoints do Dropbox).
 * @param {string} endpoint ex.: `files/list_folder`
 * @param {Object|null} corpo `null` manda um corpo vazio
 * @returns {Promise<Object>}
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
 * Envia (ou sobrescreve) um arquivo de texto na pasta do app.
 *
 * `mode: overwrite` é proposital: `backup-atual.json` é para ser
 * substituído. Sem isso o Dropbox criaria `backup-atual (1).json`,
 * `(2)`, e a pasta viraria um cemitério em uma semana.
 *
 * @param {string} caminho ex.: `/backup-atual.json`
 * @param {string} conteudo
 * @returns {Promise<Object>} metadados do arquivo gravado
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

/**
 * Baixa um arquivo da pasta do app e devolve o texto.
 * @param {string} caminho
 * @returns {Promise<string>}
 */
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
 * Lista os arquivos de uma pasta.
 *
 * Pasta que não existe devolve lista vazia em vez de erro: antes do
 * primeiro backup, `/diario` realmente não existe, e isso é normal, não
 * é falha.
 *
 * @param {string} pasta `''` para a raiz da pasta do app
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

/**
 * Apaga um arquivo da pasta do app.
 *
 * Usado só na rotação das cópias diárias. Um arquivo que já não existe
 * não é erro — se duas rotações correrem juntas, a segunda encontra o
 * trabalho feito.
 *
 * @param {string} caminho
 * @returns {Promise<void>}
 */
export async function apagarArquivo(caminho) {
  try {
    await chamar('files/delete_v2', { path: caminho });
  } catch (erro) {
    if (/not_found/.test(erro.message)) return;
    throw erro;
  }
}
