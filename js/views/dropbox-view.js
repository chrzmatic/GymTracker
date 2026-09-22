/**
 * Tela do backup no Dropbox (especificação, seção 6.9).
 *
 * Reúne tudo o que é do Dropbox numa tela só, em vez de espalhar pela
 * tela de configurações: conectar, ver o status, mandar um backup na hora
 * e restaurar um dos backups guardados.
 *
 * ## A ordem dos botões de conectar não é acidental
 *
 * "Colar o código" vem **primeiro**, mesmo sendo o caminho mais
 * trabalhoso, porque é o único que funciona com o app instalado na Tela
 * de Início do iPhone — que é onde eu uso este app. O botão de
 * redirecionamento fica abaixo, marcado como o do computador.
 */

import { formulario, confirmar, avisar, escolher } from '../components/dialogo.js';
import { formatarDataHora } from '../utils/date.js';
import { recarregar, recomecar } from '../navegacao.js';
import { redirectUri, podeUsarRedirect, APP_KEY } from '../sync/dropbox-config.js';
import {
  lerAppKey,
  salvarAppKey,
  lerEstado,
  salvarEstado,
} from '../sync/dropbox-estado.js';
import {
  urlDeAutorizacao,
  trocarCodigoPorToken,
  nomeDaConta,
  desconectar,
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
    raiz.appendChild(cardAppKey());
    return;
  }

  // Conectar sem internet (ou com o Dropbox fora do ar) deixa o nome da
  // conta em branco para sempre, porque ele só era buscado no login.
  // Buscar aqui resolve na primeira vez que a tela abre com conexão, e
  // falhar não custa nada — o card apenas omite a linha da conta.
  const antes = sync.estado();
  if (antes.conectado && !antes.conta) await nomeDaConta();

  const estado = sync.estado();

  raiz.appendChild(cardStatus(estado));

  if (estado.conectado) {
    raiz.appendChild(cardAcoes());
    raiz.appendChild(cardRestaurar());
    raiz.appendChild(cardDesconectar());
  } else {
    raiz.appendChild(cardConectar());
  }

  raiz.appendChild(cardComoFunciona());
}

/**
 * Pede o app key, que de propósito não está no código.
 *
 * O repositório é público e eu preferi não deixar a chave à vista, ainda
 * que publicá-la fosse seguro no PKCE. O preço é este card: cada aparelho
 * recebe a chave uma vez. São dois aparelhos.
 *
 * Como cada endereço tem armazenamento próprio, isto aparece uma vez no
 * app publicado, uma vez no ícone da Tela de Início e uma vez no
 * localhost — os três são cofres separados, o mesmo motivo pelo qual os
 * dados de um não aparecem no outro.
 */
function cardAppKey() {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = 'Falta o app key neste aparelho';
  h3.style.margin = '0 0 4px';
  card.appendChild(h3);

  const texto = document.createElement('p');
  texto.className = 'texto-fraco pequeno';
  texto.textContent =
    'A chave não fica no código, então cada aparelho precisa dela uma vez. Ela está em dropbox.com/developers/apps → seu app GymTracker → aba Settings → App key.';
  card.appendChild(texto);

  const nota = document.createElement('p');
  nota.className = 'texto-fraco pequeno';
  nota.textContent =
    'Cole só o App key. O App secret não é usado por este app e não deve ser colado aqui nem em lugar nenhum.';
  card.appendChild(nota);

  const btn = document.createElement('button');
  btn.className = 'btn btn-primario btn-bloco';
  btn.textContent = 'Colar o app key';
  btn.onclick = pedirAppKey;
  card.appendChild(btn);

  return card;
}

/** Conectado ou não, última vez, pendência e o último erro. */
function cardStatus(estado) {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = estado.conectado ? 'Conectado' : 'Não conectado';
  h3.style.margin = '0 0 4px';
  card.appendChild(h3);

  const linhas = [];
  if (estado.conectado && estado.conta) linhas.push('Conta: ' + estado.conta);
  linhas.push(
    estado.ultimoEm
      ? 'Último backup: ' + formatarDataHora(estado.ultimoEm)
      : 'Nenhum backup enviado ainda.'
  );
  if (estado.pendente) {
    linhas.push('Há um backup pendente: sai na próxima vez que o app abrir com internet.');
  }

  linhas.forEach((texto) => {
    const p = document.createElement('p');
    p.className = 'texto-fraco pequeno';
    p.style.margin = '2px 0 0';
    p.textContent = texto;
    card.appendChild(p);
  });

  if (estado.ultimoErro) {
    const erro = document.createElement('p');
    erro.className = 'pequeno';
    erro.style.margin = '8px 0 0';
    erro.style.color = 'var(--piora)';
    erro.textContent = 'Último erro: ' + estado.ultimoErro;
    card.appendChild(erro);
  }

  return card;
}

/** Os dois caminhos de login. */
function cardConectar() {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = 'Conectar';
  h3.style.margin = '0 0 4px';
  card.appendChild(h3);

  const explica = document.createElement('p');
  explica.className = 'texto-fraco pequeno';
  explica.textContent =
    'O app só enxerga a própria pasta do Dropbox (Apps/GymTracker). O resto dos seus arquivos fica invisível para ele.';
  card.appendChild(explica);

  const colar = document.createElement('button');
  colar.className = 'btn btn-primario btn-bloco';
  colar.textContent = 'Conectar colando um código';
  colar.onclick = conectarColandoCodigo;
  card.appendChild(colar);

  const dicaColar = document.createElement('p');
  dicaColar.className = 'texto-fraco pequeno';
  dicaColar.style.margin = '4px 0 12px';
  dicaColar.textContent =
    'O jeito que funciona no iPhone com o app na Tela de Início. Abre o Dropbox, você autoriza, ele mostra um código e você cola aqui.';
  card.appendChild(dicaColar);

  const dicaRedirect = document.createElement('p');
  dicaRedirect.className = 'texto-fraco pequeno';
  dicaRedirect.style.margin = '4px 0 0';

  if (podeUsarRedirect()) {
    const redirecionar = document.createElement('button');
    redirecionar.className = 'btn btn-bloco';
    redirecionar.textContent = 'Conectar direto (computador)';
    redirecionar.onclick = conectarComRedirect;
    card.appendChild(redirecionar);

    dicaRedirect.textContent =
      'Volta sozinho para o app. Exige que "' +
      redirectUri() +
      '" esteja cadastrado em Redirect URIs, na aba Settings do app no Dropbox.';
  } else {
    // Rodando local: o Dropbox só aceita a volta no endereço publicado, e
    // oferecer o botão aqui seria oferecer um erro.
    dicaRedirect.textContent =
      'O login com redirecionamento não funciona neste endereço (' +
      window.location.host +
      '): no Dropbox está cadastrado só o endereço publicado. Use o botão acima, que não depende disso.';
  }

  card.appendChild(dicaRedirect);

  return card;
}

/**
 * Fluxo sem redirecionamento: abre o Dropbox numa aba e espera o código.
 *
 * O diálogo de colar abre **junto** com a aba do Dropbox, e não depois,
 * porque no iPhone o app pode ser descartado da memória enquanto você
 * está no Safari autorizando. Com o diálogo já aberto, voltar ao app
 * encontra o campo esperando; se o app tiver morrido, a mensagem de
 * "o pedido se perdeu" explica o que houve em vez de falhar calado.
 */
async function conectarColandoCodigo() {
  let url;
  try {
    url = await urlDeAutorizacao({ comRedirect: false });
  } catch (erro) {
    return avisarErroDeLogin(erro);
  }

  window.open(url, '_blank', 'noopener');

  const dados = await formulario(
    'Cole o código do Dropbox',
    [
      {
        nome: 'codigo',
        rotulo: 'Código',
        tipo: 'text',
        dica: 'Abriu uma aba do Dropbox. Autorize, copie o código que aparecer e cole aqui. Ele vale uma vez só e por poucos minutos.',
      },
    ],
    'Conectar'
  );
  if (!dados || !dados.codigo.trim()) return;

  try {
    await trocarCodigoPorToken(dados.codigo, { comRedirect: false });
    await depoisDeConectar();
  } catch (erro) {
    await avisarErroDeLogin(erro);
  }
}

/** Fluxo normal: sai do app e volta com `?code=` na URL. */
async function conectarComRedirect() {
  try {
    const url = await urlDeAutorizacao({ comRedirect: true });
    window.location.href = url;
  } catch (erro) {
    await avisarErroDeLogin(erro);
  }
}

/** Mensagem de erro de login, com o caso do app key faltando à parte. */
async function avisarErroDeLogin(erro) {
  if (erro instanceof SemAppKey) {
    await avisar('Falta o app key', 'Cole o app key do Dropbox antes de conectar.');
    await recarregar();
    return;
  }
  await avisar('Não consegui conectar', String(erro && erro.message ? erro.message : erro));
}

/**
 * Fecha o login: descobre o nome da conta e já manda o primeiro backup.
 *
 * O primeiro backup sai na hora de propósito. Conectar e não ver nada
 * acontecer deixa a dúvida de se funcionou — e a resposta só viria 24
 * horas depois, que é tarde demais para descobrir que a permissão estava
 * errada no App Console.
 */
async function depoisDeConectar() {
  await nomeDaConta();
  await recarregar();

  const resultado = await sync.fazerBackup('manual');
  if (resultado.ok) {
    await avisar('Conectado', 'O primeiro backup já foi enviado para o Dropbox.');
  } else if (resultado.pendente) {
    await avisar('Conectado', 'Sem internet agora. O primeiro backup sai assim que houver conexão.');
  } else {
    await avisar('Conectado, mas o backup falhou', resultado.erro || 'Motivo desconhecido.');
  }
  await recarregar();
}

/** "Fazer backup agora". */
function cardAcoes() {
  const card = document.createElement('div');
  card.className = 'card';

  const btn = document.createElement('button');
  btn.className = 'btn btn-primario btn-bloco';
  btn.textContent = 'Fazer backup agora';
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    const resultado = await sync.fazerBackup('manual');
    btn.disabled = false;
    btn.textContent = 'Fazer backup agora';

    if (resultado.ok) {
      await avisar('Backup enviado', tamanhoLegivel(resultado.bytes) + ' no Dropbox.');
    } else if (resultado.pendente) {
      await avisar('Sem internet', 'O backup ficou pendente e sai assim que houver conexão.');
    } else {
      await avisar('O backup falhou', resultado.erro || 'Motivo desconhecido.');
    }
    await recarregar();
  };
  card.appendChild(btn);

  const nota = document.createElement('p');
  nota.className = 'texto-fraco pequeno';
  nota.style.margin = '8px 0 0';
  nota.textContent =
    'O backup também sai sozinho ao finalizar um treino, ao mexer na dieta e ao abrir o app depois de 24 horas.';
  card.appendChild(nota);

  return card;
}

/** Lista os backups do Dropbox e restaura o escolhido. */
function cardRestaurar() {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = 'Restaurar';
  h3.style.margin = '0 0 4px';
  card.appendChild(h3);

  const explica = document.createElement('p');
  explica.className = 'texto-fraco pequeno';
  explica.textContent =
    'Substitui os dados deste aparelho pelos do backup escolhido. É assim que se leva o histórico do computador para o iPhone, ou se volta atrás de uma bagunça.';
  card.appendChild(explica);

  const btn = document.createElement('button');
  btn.className = 'btn btn-bloco';
  btn.textContent = 'Ver backups no Dropbox';
  btn.onclick = () => escolherERestaurar(btn);
  card.appendChild(btn);

  return card;
}

/** Baixa a lista, deixa escolher, confirma e restaura. */
async function escolherERestaurar(btn) {
  btn.disabled = true;
  btn.textContent = 'Buscando…';

  let lista;
  try {
    lista = await sync.listarBackups();
  } catch (erro) {
    btn.disabled = false;
    btn.textContent = 'Ver backups no Dropbox';
    return avisar('Não consegui listar', String(erro && erro.message ? erro.message : erro));
  }

  btn.disabled = false;
  btn.textContent = 'Ver backups no Dropbox';

  if (!lista.length) {
    return avisar('Nenhum backup', 'Ainda não há nada na pasta do app no Dropbox.');
  }

  const escolhido = await escolher(
    'Qual backup restaurar?',
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
 * O que há dentro do arquivo aparece **antes** da confirmação, pelo mesmo
 * motivo do "Importar JSON": um backup tirado de uma instalação nova tem
 * quase 80 registros de treinos e alimentos padrão e parece cheio, mas
 * pode não ter nenhuma sessão sua. Confirmar às cegas é como se perde um
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
    'Restaurar este backup?',
    'Backup de ' +
      (backup.data || 'data desconhecida') +
      ': ' +
      descreverBackup(backup) +
      '. ' +
      (perdas.length
        ? 'VOCÊ VAI PERDER o que este aparelho tem a mais — ' + perdas.join('; ') + '. '
        : '') +
      'Os dados deste aparelho são substituídos pelos do arquivo, e não dá para desfazer.',
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
      'O banco aceitou a gravação mas, relendo, falta coisa — ' +
        resultado.divergencias.join('; ') +
        '. Nada foi perdido no Dropbox: tente de novo, com o app aberto na frente.'
    );
  } else {
    const total = Object.values(resultado.gravados).reduce((soma, n) => soma + n, 0);
    await avisar('Backup restaurado', total + ' registros conferidos no banco.');
  }

  await recomecar();
}

/** Desconectar, apagando o token deste aparelho. */
function cardDesconectar() {
  const card = document.createElement('div');
  card.className = 'card';

  const btn = document.createElement('button');
  btn.className = 'btn btn-bloco btn-perigo';
  btn.textContent = 'Desconectar do Dropbox';
  btn.onclick = async () => {
    const ok = await confirmar(
      'Desconectar do Dropbox?',
      'O token sai deste aparelho e os backups automáticos param. Os arquivos já enviados continuam no seu Dropbox.',
      'Desconectar'
    );
    if (!ok) return;
    desconectar();
    await recarregar();
  };
  card.appendChild(btn);

  return card;
}

/** O que o app faz com a pasta, em português. */
function cardComoFunciona() {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = 'Como funciona';
  h3.style.margin = '0 0 4px';
  card.appendChild(h3);

  const lista = document.createElement('ul');
  lista.className = 'texto-fraco pequeno';
  lista.style.margin = '0';
  lista.style.paddingLeft = '18px';
  [
    'backup-atual.json é sobrescrito a cada backup.',
    'diario/backup-AAAA-MM-DD.json guarda uma cópia por dia, mantendo as 7 últimas.',
    'Sem internet, o backup fica pendente e sai na próxima abertura com conexão.',
    'O app só enxerga a própria pasta: Apps/GymTracker no seu Dropbox.',
  ].forEach((texto) => {
    const li = document.createElement('li');
    li.textContent = texto;
    lista.appendChild(li);
  });
  card.appendChild(lista);

  // Sem isto, colar a chave errada seria um beco sem saída: o card de
  // colar não volta depois do primeiro acerto, e o erro só apareceria
  // como uma recusa do Dropbox na hora de conectar.
  if (!APP_KEY) {
    const trocar = document.createElement('button');
    trocar.className = 'btn btn-bloco';
    trocar.style.marginTop = '10px';
    trocar.textContent = 'Trocar o app key deste aparelho';
    trocar.onclick = pedirAppKey;
    card.appendChild(trocar);
  }

  return card;
}

/**
 * Abre o formulário do app key e recarrega a tela.
 * Serve tanto para a primeira vez quanto para corrigir uma chave errada.
 */
async function pedirAppKey() {
  const dados = await formulario(
    'App key do Dropbox',
    [
      {
        nome: 'chave',
        rotulo: 'App key',
        tipo: 'text',
        valor: lerAppKey(),
        dica: 'dropbox.com/developers/apps → GymTracker → Settings → App key. Fica guardado só neste aparelho.',
      },
    ],
    'Salvar'
  );
  if (!dados || !dados.chave.trim()) return;
  salvarAppKey(dados.chave);
  await recarregar();
}

/**
 * Tamanho em KB ou MB, para o aviso do backup dizer algo concreto.
 * @param {number} bytes
 * @returns {string}
 */
function tamanhoLegivel(bytes) {
  if (!bytes) return 'Backup enviado';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Conclui um login que voltou por redirecionamento.
 *
 * Chamado pelo `main.js` na abertura, porque o `?code=` chega na URL antes
 * de qualquer tela existir. Devolve o que houve para o app avisar.
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
    await avisar('Conectado ao Dropbox', 'O backup automático está ligado.');
    sync.fazerBackup('manual');
  } else {
    await avisar('Não consegui conectar', resultado.erro || 'Motivo desconhecido.');
  }
}

// `lerEstado` é reexportado para a tela de configurações mostrar o resumo
// sem precisar conhecer a pasta `sync`.
export { lerEstado };
