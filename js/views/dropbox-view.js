/**
 * Tela do backup no Dropbox (especificação, seção 6.9).
 *
 * Um card só: o estado em cima, os botões embaixo. Sem explicar o que o
 * backup é nem como o Dropbox funciona — isto é um app pessoal, e quem o
 * abre já sabe. Texto na tela só onde ele evita um erro que não dá para
 * desfazer (a confirmação do restaurar) ou onde é preciso no momento
 * exato (os passos de colar o código).
 */

import { formulario, confirmar, avisar, escolher } from '../components/dialogo.js';
import { formatarDataHora } from '../utils/date.js';
import { recarregar, recomecar } from '../navegacao.js';
import { podeUsarRedirect, APP_KEY } from '../sync/dropbox-config.js';
import { lerAppKey, salvarAppKey, salvarEstado } from '../sync/dropbox-estado.js';
import {
  urlDeAutorizacao,
  trocarCodigoPorToken,
  nomeDaConta,
  desconectar,
  temPedidoPendente,
  SemAppKey,
} from '../sync/dropbox-auth.js';
import * as sync from '../sync/dropbox-backup.js';

/**
 * Renderiza a tela do Dropbox.
 * @param {HTMLElement} raiz
 * @returns {Promise<void>}
 */
export async function montarDropbox(raiz) {
  raiz.innerHTML = '';

  if (!lerAppKey()) {
    raiz.appendChild(cardSemChave());
    return;
  }

  // Conectar sem internet deixaria o nome da conta em branco para sempre,
  // porque ele só era buscado no login.
  const antes = sync.estado();
  if (antes.conectado && !antes.conta) await nomeDaConta();

  raiz.appendChild(antes.conectado ? cardConectado(sync.estado()) : cardDesconectado());
}

/* ------------------------------------------------------------------ */
/* Peças                                                               */
/* ------------------------------------------------------------------ */

/** Um card com título e, opcionalmente, uma linha de detalhe. */
function card(titulo, detalhe) {
  const el = document.createElement('div');
  el.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = titulo;
  h3.style.margin = '0';
  el.appendChild(h3);

  if (detalhe) {
    const p = document.createElement('p');
    p.className = 'texto-fraco pequeno';
    p.style.margin = '2px 0 0';
    p.textContent = detalhe;
    el.appendChild(p);
  }

  return el;
}

/**
 * Botão de bloco com um espaço em cima, para os cards não precisarem
 * repetir `style.marginTop` em cada um.
 */
function botao(rotulo, aoTocar, primario = false) {
  const b = document.createElement('button');
  b.className = 'btn btn-bloco' + (primario ? ' btn-primario' : '');
  b.style.marginTop = '10px';
  b.textContent = rotulo;
  b.onclick = aoTocar;
  return b;
}

/** Linha discreta de ações secundárias, separadas por ponto. */
function acoesSecundarias(itens) {
  const linha = document.createElement('p');
  linha.className = 'pequeno';
  linha.style.margin = '12px 0 0';

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

/* ------------------------------------------------------------------ */
/* Os três estados da tela                                             */
/* ------------------------------------------------------------------ */

/** Sem app key neste aparelho. */
function cardSemChave() {
  const el = card('Falta o app key');
  el.appendChild(botao('Colar o app key', pedirAppKey, true));
  return el;
}

/** Com chave, sem conexão. */
function cardDesconectado() {
  const pendente = temPedidoPendente();
  const el = card(
    'Não conectado',
    pendente ? 'Há um login começado esperando o código.' : ''
  );

  if (pendente) {
    el.appendChild(botao('Colar o código', () => pedirOCodigo(null), true));
    el.appendChild(botao('Começar de novo', conectar));
  } else {
    el.appendChild(botao('Conectar', conectar, true));
  }

  el.appendChild(acoesSecundarias([{ rotulo: 'Trocar o app key', aoTocar: pedirAppKey }]));
  return el;
}

/** Conectado: estado e ações. */
function cardConectado(estado) {
  const linhas = [];
  if (estado.conta) linhas.push(estado.conta);
  linhas.push(
    estado.ultimoEm ? formatarDataHora(estado.ultimoEm) : 'nenhum backup ainda'
  );
  if (estado.pendente) linhas.push('pendente');

  const el = card('Conectado', linhas.join(' · '));

  if (estado.ultimoErro) {
    const erro = document.createElement('p');
    erro.className = 'pequeno';
    erro.style.margin = '6px 0 0';
    erro.style.color = 'var(--piora)';
    erro.textContent = estado.ultimoErro;
    el.appendChild(erro);
  }

  el.appendChild(botao('Fazer backup agora', fazerBackupAgora, true));
  el.appendChild(botao('Restaurar', escolherERestaurar));

  el.appendChild(
    acoesSecundarias([
      { rotulo: 'Desconectar', aoTocar: desconectarComConfirmacao },
      ...(APP_KEY ? [] : [{ rotulo: 'Trocar o app key', aoTocar: pedirAppKey }]),
    ])
  );

  return el;
}

/* ------------------------------------------------------------------ */
/* App key                                                             */
/* ------------------------------------------------------------------ */

/** Formulário do app key, para a primeira vez e para corrigir um erro. */
async function pedirAppKey() {
  const dados = await formulario(
    'App key do Dropbox',
    [
      {
        nome: 'chave',
        rotulo: 'App key',
        tipo: 'text',
        valor: lerAppKey(),
        dica: 'dropbox.com/developers/apps → GymTracker → Settings. Fica só neste aparelho.',
      },
    ],
    'Salvar'
  );
  if (!dados || !dados.chave.trim()) return;
  salvarAppKey(dados.chave);
  await recarregar();
}

/* ------------------------------------------------------------------ */
/* Conectar                                                            */
/* ------------------------------------------------------------------ */

/**
 * Um botão só: o app escolhe o caminho que funciona aqui.
 *
 * No endereço publicado vale o redirecionamento, que volta sozinho. No
 * localhost e no app da Tela de Início não vale — lá o Dropbox mostra um
 * código para colar. Perguntar isso ao usuário seria transferir para ele
 * uma decisão que o código sabe tomar.
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
 * Os dois passos de colar o código, no mesmo diálogo.
 *
 * Juntos porque no iPhone sair para o Safari e voltar é uma viagem só de
 * ida em potencial: o app pode ser descartado da memória enquanto você
 * autoriza. Com o campo já aberto, voltar encontra onde colar.
 *
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

/** Erro de login, com o caso da chave faltando à parte. */
async function avisarErroDeLogin(erro) {
  if (erro instanceof SemAppKey) {
    await recarregar();
    return;
  }
  await avisar('Não consegui conectar', String(erro && erro.message ? erro.message : erro));
}

/**
 * Fecha o login e já manda o primeiro backup.
 *
 * Na hora, de propósito: conectar e não ver nada acontecer deixa a dúvida
 * de se funcionou, e a resposta só viria 24 horas depois — tarde demais
 * para descobrir que a permissão no App Console estava errada.
 */
async function depoisDeConectar() {
  await nomeDaConta();
  const resultado = await sync.fazerBackup('manual');
  await recarregar();

  if (!resultado.ok && !resultado.pendente) {
    await avisar('Conectado, mas o backup falhou', resultado.erro || 'Motivo desconhecido.');
  }
}

/* ------------------------------------------------------------------ */
/* Backup e restauração                                                */
/* ------------------------------------------------------------------ */

/** "Fazer backup agora", com o botão contando o que está havendo. */
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

/** Baixa a lista, deixa escolher, confirma e restaura. */
async function escolherERestaurar(evento) {
  const btn = evento.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Buscando…';

  let lista;
  try {
    lista = await sync.listarBackups();
  } catch (erro) {
    return avisar('Não consegui listar', String(erro && erro.message ? erro.message : erro));
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
    }))
  );
  if (!escolhido) return;

  await restaurarCaminho(escolhido);
}

/**
 * Baixa, mostra o que tem dentro, confirma e grava.
 *
 * O conteúdo aparece **antes** da confirmação pelo mesmo motivo do
 * "Importar JSON": um backup tirado de uma instalação nova tem quase 80
 * registros de treinos e alimentos padrão e parece cheio, mas pode não
 * ter nenhuma sessão sua. Confirmar às cegas é como se perde um
 * histórico.
 *
 * @param {string} caminho
 */
async function restaurarCaminho(caminho) {
  const { descreverBackup, perdasAoRestaurar } = await import(
    '../services/backup-service.js'
  );

  let backup;
  try {
    backup = await sync.baixarBackup(caminho);
  } catch (erro) {
    return avisar('Não consegui baixar', String(erro && erro.message ? erro.message : erro));
  }

  let perdas = [];
  try {
    perdas = await perdasAoRestaurar(backup);
  } catch {
    /* sem a comparação, o aviso genérico abaixo ainda vale */
  }

  const ok = await confirmar(
    'Restaurar o backup de ' + (backup.data || 'data desconhecida') + '?',
    descreverBackup(backup) +
      '. ' +
      (perdas.length ? 'VOCÊ VAI PERDER — ' + perdas.join('; ') + '. ' : '') +
      'Substitui os dados deste aparelho e não dá para desfazer.',
    'Restaurar'
  );
  if (!ok) return;

  let resultado;
  try {
    resultado = await sync.restaurarDoDropbox(backup);
  } catch (erro) {
    return avisar('Não consegui restaurar', String(erro && erro.message ? erro.message : erro));
  }

  if (resultado.divergencias.length) {
    await avisar(
      'O backup não entrou inteiro',
      'Falta ' +
        resultado.divergencias.join('; ') +
        '. Nada foi perdido no Dropbox: tente de novo.'
    );
  } else {
    const total = Object.values(resultado.gravados).reduce((soma, n) => soma + n, 0);
    await avisar('Restaurado', total + ' registros conferidos no banco.');
  }

  await recomecar();
}

/** Desconectar, apagando o token deste aparelho. */
async function desconectarComConfirmacao() {
  const ok = await confirmar(
    'Desconectar do Dropbox?',
    'Os backups automáticos param. Os arquivos já enviados continuam lá.',
    'Desconectar'
  );
  if (!ok) return;
  desconectar();
  await recarregar();
}

/* ------------------------------------------------------------------ */
/* Login que voltou pela URL                                           */
/* ------------------------------------------------------------------ */

/**
 * Conclui um login que voltou por redirecionamento.
 *
 * Chamado pelo `main.js` na abertura, porque o `?code=` chega na URL
 * antes de qualquer tela existir.
 *
 * @returns {Promise<void>}
 */
export async function concluirLoginPendente() {
  const { concluirLoginDoRedirect } = await import('../sync/dropbox-auth.js');
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
