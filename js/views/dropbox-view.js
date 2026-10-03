/** Tela do backup no Dropbox: estado em cima, botões embaixo. */

import { avisar, confirmar, escolher, formulario } from '../components/dialogo.js';
import { formatarDataHora } from '../utils/date.js';
import { recarregar, recomecar } from '../navegacao.js';
import { APP_KEY, podeUsarRedirect } from '../sync/dropbox-config.js';
import { lerAppKey, salvarAppKey, salvarEstado } from '../sync/dropbox-estado.js';
import {
  concluirLoginDoRedirect,
  desconectar,
  nomeDaConta,
  SemAppKey,
  temPedidoPendente,
  trocarCodigoPorToken,
  urlDeAutorizacao,
} from '../sync/dropbox-auth.js';
import * as sync from '../sync/dropbox-backup.js';

/** Monta a tela do Dropbox. */
export async function montarDropbox(raiz) {
  raiz.innerHTML = '';

  if (!lerAppKey()) {
    raiz.appendChild(cardSemChave());
    return;
  }

  // Busca o nome da conta se ficou vazio (ex.: conectou sem internet).
  const antes = sync.estado();
  if (antes.conectado && !antes.conta) await nomeDaConta();

  raiz.appendChild(antes.conectado ? cardConectado(sync.estado()) : cardDesconectado());
}

/* --- Peças --- */

/** Card com título e uma linha de detalhe opcional. */
function card(titulo, detalhe) {
  const el = document.createElement('div');
  el.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = titulo;
  h3.classList.add('m-0');
  el.appendChild(h3);

  if (detalhe) {
    const p = document.createElement('p');
    p.className = 'texto-fraco pequeno m-0 mt-1';
    p.textContent = detalhe;
    el.appendChild(p);
  }

  return el;
}

/** Botão de bloco com espaço em cima. */
function botao(rotulo, aoTocar, primario = false) {
  const b = document.createElement('button');
  b.className = 'btn btn-bloco' + (primario ? ' btn-primario' : '');
  b.classList.add('mt-3');
  b.textContent = rotulo;
  b.onclick = aoTocar;
  return b;
}

/** Linha de ações secundárias, separadas por ponto. */
function acoesSecundarias(itens) {
  const linha = document.createElement('p');
  linha.className = 'pequeno m-0 mt-3';

  itens.forEach((item, i) => {
    if (i) linha.appendChild(document.createTextNode(' · '));
    const b = document.createElement('button');
    b.className = 'link-discreto';
    b.textContent = item.rotulo;
    b.onclick = item.aoTocar;
    linha.appendChild(b);
  });

  return linha;
}

/* --- Estados da tela --- */

/** Sem app key neste aparelho. */
function cardSemChave() {
  const el = card('Falta o app key');
  el.appendChild(botao('Colar o app key', pedirAppKey, true));
  return el;
}

/** Com app key, sem conexão. */
function cardDesconectado() {
  const pendente = temPedidoPendente();
  const el = card(
    'Não conectado',
    pendente ? 'Há um login começado esperando o código.' : '',
  );

  if (pendente) {
    el.appendChild(botao('Colar o código', () => pedirOCodigo(null), true));
    el.appendChild(botao('Começar de novo', conectar));
  } else {
    el.appendChild(botao('Conectar', conectar, true));
  }

  el.appendChild(
    acoesSecundarias([{ rotulo: 'Trocar o app key', aoTocar: pedirAppKey }]),
  );
  return el;
}

/** Conectado: estado e ações. */
function cardConectado(estado) {
  const linhas = [];
  if (estado.conta) linhas.push(estado.conta);
  linhas.push(
    estado.ultimoEm ? formatarDataHora(estado.ultimoEm) : 'nenhum backup ainda',
  );
  if (estado.pendente) linhas.push('pendente');

  const el = card('Conectado', linhas.join(' · '));

  if (estado.ultimoErro) {
    const erro = document.createElement('p');
    erro.className = 'pequeno m-0 mt-2';
    erro.classList.add('texto-erro');
    erro.textContent = estado.ultimoErro;
    el.appendChild(erro);
  }

  el.appendChild(botao('Fazer backup agora', fazerBackupAgora, true));
  el.appendChild(botao('Restaurar', escolherERestaurar));

  el.appendChild(
    acoesSecundarias([
      { rotulo: 'Desconectar', aoTocar: desconectarComConfirmacao },
      ...(APP_KEY ? [] : [{ rotulo: 'Trocar o app key', aoTocar: pedirAppKey }]),
    ]),
  );

  return el;
}

/* --- App key --- */

/** Formulário do app key. */
async function pedirAppKey() {
  const dados = await formulario(
    'App key do Dropbox',
    [
      {
        nome: 'chave',
        rotulo: 'App key',
        tipo: 'text',
        valor: lerAppKey(),
        dica:
          'dropbox.com/developers/apps → GymTracker → Settings. Fica só neste aparelho.',
      },
    ],
    'Salvar',
  );
  if (!dados || !dados.chave.trim()) return;
  salvarAppKey(dados.chave);
  await recarregar();
}

/* --- Conectar --- */

/**
 * Conecta pelo caminho que funciona aqui: redirecionamento no endereço
 * publicado, código colado no localhost e no app da Tela de Início.
 */
async function conectar() {
  const comRedirect = podeUsarRedirect();

  let url;
  try {
    url = await urlDeAutorizacao({ comRedirect });
  } catch (erro) {
    return avisarErroDeLogin(erro);
  }

  if (comRedirect) {
    window.location.href = url;
    return;
  }
  return pedirOCodigo(url);
}

/**
 * Abre o Dropbox e pede o código no mesmo diálogo, para o campo já estar
 * aberto ao voltar.
 * @param {string|null} url null quando o pedido já existe e só falta colar
 */
async function pedirOCodigo(url) {
  const campos = [];

  if (url) {
    campos.push({
      nome: 'abrir',
      tipo: 'link',
      href: url,
      rotulo: '1. Autorizar no Dropbox',
      dica: 'Ao autorizar, o Dropbox mostra um código.',
    });
  }

  campos.push({
    nome: 'codigo',
    rotulo: url ? '2. Código' : 'Código',
    tipo: 'text',
  });

  const dados = await formulario('Conectar ao Dropbox', campos, 'Conectar');
  if (!dados || !dados.codigo.trim()) return;

  try {
    await trocarCodigoPorToken(dados.codigo, { comRedirect: false });
    await depoisDeConectar();
  } catch (erro) {
    await avisarErroDeLogin(erro);
  }
}

/** Mostra um erro de login. */
async function avisarErroDeLogin(erro) {
  if (erro instanceof SemAppKey) {
    await recarregar();
    return;
  }
  await avisar(
    'Não consegui conectar',
    String(erro && erro.message ? erro.message : erro),
  );
}

/** Termina o login e já faz o primeiro backup, para confirmar que funciona. */
async function depoisDeConectar() {
  await nomeDaConta();
  const resultado = await sync.fazerBackup('manual');
  await recarregar();

  if (!resultado.ok && !resultado.pendente) {
    await avisar(
      'Conectado, mas o backup falhou',
      resultado.erro || 'Motivo desconhecido.',
    );
  }
}

/* --- Backup e restauração --- */

/** "Fazer backup agora", com o andamento no botão. */
async function fazerBackupAgora(evento) {
  const btn = evento.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Enviando…';

  const resultado = await sync.fazerBackup('manual');

  btn.disabled = false;
  btn.textContent = 'Fazer backup agora';

  if (!resultado.ok && !resultado.pendente) {
    await avisar('O backup falhou', resultado.erro || 'Motivo desconhecido.');
  }
  await recarregar();
}

/** Lista os backups, deixa escolher e restaura. */
async function escolherERestaurar(evento) {
  const btn = evento.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Buscando…';

  let lista;
  try {
    lista = await sync.listarBackups();
  } catch (erro) {
    return avisar(
      'Não consegui listar',
      String(erro && erro.message ? erro.message : erro),
    );
  } finally {
    btn.disabled = false;
    btn.textContent = 'Restaurar';
  }

  if (!lista.length) {
    return avisar('Nenhum backup', 'A pasta do app no Dropbox está vazia.');
  }

  const escolhido = await escolher(
    'Restaurar qual?',
    lista.map((e) => ({
      valor: e.caminho,
      rotulo: e.rotulo + ' · ' + formatarDataHora(e.modificadoEm),
    })),
  );
  if (!escolhido) return;

  await restaurarCaminho(escolhido);
}

/** Baixa, mostra o conteúdo, confirma e grava. */
async function restaurarCaminho(caminho) {
  const { descreverBackup, perdasAoRestaurar } = await import(
    '../services/backup-service.js'
  );

  let backup;
  try {
    backup = await sync.baixarBackup(caminho);
  } catch (erro) {
    return avisar(
      'Não consegui baixar',
      String(erro && erro.message ? erro.message : erro),
    );
  }

  let perdas = [];
  try {
    perdas = await perdasAoRestaurar(backup);
  } catch {
    /* Sem a comparação, vale o aviso genérico. */
  }

  const ok = await confirmar(
    'Restaurar o backup de ' + (backup.data || 'data desconhecida') + '?',
    descreverBackup(backup) +
      '. ' +
      (perdas.length ? 'VOCÊ VAI PERDER — ' + perdas.join('; ') + '. ' : '') +
      'Substitui os dados deste aparelho e não dá para desfazer.',
    'Restaurar',
  );
  if (!ok) return;

  let resultado;
  try {
    resultado = await sync.restaurarDoDropbox(backup);
  } catch (erro) {
    return avisar(
      'Não consegui restaurar',
      String(erro && erro.message ? erro.message : erro),
    );
  }

  if (resultado.divergencias.length) {
    await avisar(
      'O backup não entrou inteiro',
      'Falta ' +
        resultado.divergencias.join('; ') +
        '. Nada foi perdido no Dropbox: tente de novo.',
    );
  } else {
    const total = Object.values(resultado.gravados).reduce((soma, n) => soma + n, 0);
    await avisar('Restaurado', total + ' registros conferidos no banco.');
  }

  await recomecar();
}

/** Desconecta, com confirmação. */
async function desconectarComConfirmacao() {
  const ok = await confirmar(
    'Desconectar do Dropbox?',
    'Os backups automáticos param. Os arquivos já enviados continuam lá.',
    'Desconectar',
  );
  if (!ok) return;
  desconectar();
  await recarregar();
}

/* --- Login que voltou pela URL --- */

/** Conclui um login que voltou por redirecionamento (chamado pelo main.js). */
export async function concluirLoginPendente() {
  const resultado = await concluirLoginDoRedirect();
  if (!resultado.houve) return;

  if (resultado.ok) {
    await nomeDaConta();
    salvarEstado({ ultimoErro: null });
    sync.fazerBackup('manual');
  } else {
    await avisar('Não consegui conectar', resultado.erro || 'Motivo desconhecido.');
  }
}
