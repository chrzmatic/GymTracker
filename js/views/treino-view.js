/**
 * Aba Treino: escolher o treino ou registrar a sessão aberta.
 * Tudo é salvo a cada alteração.
 */

import { hojeIso, formatarLongo, descreverDistancia } from '../utils/date.js';
import { paraNumero, num } from '../utils/format.js';
import { ROTULO_CARGA, mapaExercicios, listarExercicios } from '../data/exercicios-repo.js';
import { listarTreinosAgrupados, nomeDoItem } from '../services/treino-service.js';
import * as sessoes from '../services/sessao-service.js';
import { sugestaoPara } from '../services/rotacao-service.js';
import { diaDaProximaSugestao } from '../domain/rotacao.js';
import { confirmar, escolher, escolherComBusca, formulario } from '../components/dialogo.js';
import { abrir, voltarUmaTela } from '../navegacao.js';

/** Estado da tela. O banco é a fonte da verdade. */
const estado = {
  sessaoId: null,
  sessao: null,
  series: [],
  exercicios: new Map(),
  ultimaVezPorExercicio: new Map(),
  /** true quando a sessão foi aberta de outra tela (histórico, calendário, resumo). */
  veioDeOutraTela: false,
};

let raiz = null;

/**
 * Monta a aba Treino. Com `sessaoId`, abre aquela sessão;
 * sem, retoma a sessão em andamento, se houver.
 * @param {HTMLElement} elemento
 * @param {{sessaoId?: string}} [params]
 */
export async function montarTreino(elemento, params = {}) {
  raiz = elemento;
  if (params.sessaoId) {
    estado.sessaoId = params.sessaoId;
    estado.veioDeOutraTela = true;
  } else {
    const aberta = await sessoes.sessaoEmAndamento();
    estado.sessaoId = aberta ? aberta.id : null;
    estado.veioDeOutraTela = false;
  }
  await desenhar();
}

/** Redesenha e, por último, mostra o aviso do backup se preciso. */
async function desenhar() {
  await desenharConteudo();
  avisarSeOBackupFalhou();
}

async function desenharConteudo() {
  if (!raiz) return;
  if (!estado.sessaoId) {
    estado.sessao = null;
    await desenharEscolhaDeTreino();
    return;
  }
  const carregada = await sessoes.carregarSessao(estado.sessaoId);
  if (!carregada) {
    estado.sessaoId = null;
    await desenhar();
    return;
  }
  estado.sessao = carregada.sessao;
  estado.series = carregada.series;
  estado.exercicios = carregada.exercicios;
  await carregarUltimasVezes();
  desenharSessao();
}

/** Última vez de cada exercício da sessão. */
async function carregarUltimasVezes() {
  const ids = [...new Set(estado.sessao.itens.map((i) => i.exercicioId).filter(Boolean))];
  estado.ultimaVezPorExercicio = await sessoes.ultimasVezes(estado.sessao, ids);
}

/* --- Escolher o treino --- */

async function desenharEscolhaDeTreino() {
  const hoje = hojeIso();
  const deHoje = await sessoes.listarSessoesDaData(hoje);

  // Se já treinou hoje, a sugestão é para amanhã.
  const dia = diaDaProximaSugestao(hoje, deHoje);

  const [{ rotacao, extras }, exercicios, sugestao] = await Promise.all([
    listarTreinosAgrupados(),
    mapaExercicios(),
    sugestaoPara(dia),
  ]);

  raiz.innerHTML = '';

  if (!rotacao.length && !extras.length) {
    raiz.innerHTML = '<div class="vazio">Nenhum treino cadastrado ainda.</div>';
    raiz.appendChild(atalhosDeGestao());
    return;
  }

  if (deHoje.length) raiz.appendChild(cardDoQueJaFoiHoje(deHoje));
  if (sugestao) raiz.appendChild(cardDeSugestao(sugestao, exercicios, dia !== hoje));

  const secao = (titulo, treinos) => {
    if (!treinos.length) return;
    const h = document.createElement('h2');
    h.textContent = titulo;
    h.style.margin = '16px 0 8px';
    raiz.appendChild(h);
    treinos.forEach((t) => raiz.appendChild(cardDeTreino(t, exercicios)));
  };

  secao('Rotação', rotacao);
  secao('Extras', extras);
  raiz.appendChild(atalhosDeGestao());
}

/** Card com os treinos já feitos hoje. */
function cardDoQueJaFoiHoje(deHoje) {
  const card = document.createElement('div');
  card.className = 'card';

  const cab = document.createElement('div');
  cab.className = 'card-cabecalho';
  const h3 = document.createElement('h3');
  h3.textContent =
    deHoje.length === 1
      ? 'Você já treinou hoje'
      : `Você já fez ${deHoje.length} treinos hoje`;
  cab.appendChild(h3);
  card.appendChild(cab);

  deHoje.forEach((s) => {
    const botao = document.createElement('button');
    botao.className = 'btn btn-bloco';
    botao.style.marginTop = '6px';
    botao.style.justifyContent = 'flex-start';
    botao.textContent = 'Treino ' + s.treinoNome;
    const etiqueta = document.createElement('span');
    etiqueta.className = 'texto-fraco pequeno';
    etiqueta.style.marginLeft = 'auto';
    etiqueta.textContent =
      s.status === sessoes.STATUS.FINALIZADA ? 'finalizado' : 'em andamento';
    botao.appendChild(etiqueta);
    botao.onclick = () => abrir('treino', { sessaoId: s.id });
    card.appendChild(botao);
  });

  return card;
}

/**
 * Card do treino sugerido. Os outros treinos continuam listados embaixo.
 * @param {Object} sugestao
 * @param {Map<string, Object>} exercicios
 * @param {boolean} paraAmanha true se já treinou hoje
 */
function cardDeSugestao(sugestao, exercicios, paraAmanha) {
  const card = document.createElement('div');
  card.className = 'card card-sugestao';

  const etq = document.createElement('span');
  etq.className = 'etiqueta etiqueta-acento';
  etq.textContent = paraAmanha ? 'sugerido para amanhã' : 'sugerido para hoje';
  card.appendChild(etq);

  const h2 = document.createElement('h2');
  h2.textContent = 'Treino ' + sugestao.treino.nome;
  h2.style.margin = '8px 0 4px';
  card.appendChild(h2);

  const porque = document.createElement('p');
  porque.className = 'texto-fraco pequeno';
  porque.style.margin = '0 0 8px';
  porque.textContent = sugestao.explicacao;
  card.appendChild(porque);

  const lista = document.createElement('p');
  lista.className = 'texto-fraco pequeno';
  lista.style.margin = '0 0 10px';
  lista.textContent = sugestao.treino.itens
    .map((i) => nomeDoItem(i, exercicios))
    .join(' · ');
  card.appendChild(lista);

  const botao = document.createElement('button');
  botao.className = 'btn btn-primario btn-bloco';
  // Mesmo sugerido para amanhã, o botão registra hoje (segunda sessão do dia).
  botao.textContent = paraAmanha
    ? 'Fazer o ' + sugestao.treino.nome + ' hoje mesmo'
    : 'Começar treino ' + sugestao.treino.nome;
  botao.onclick = () => comecar(sugestao.treino.id, hojeIso());
  card.appendChild(botao);

  return card;
}


/** Atalhos para editar treinos e ver o histórico. */
function atalhosDeGestao() {
  const div = document.createElement('div');
  div.className = 'linha-botoes';
  div.style.marginTop = '20px';

  const editar = document.createElement('button');
  editar.className = 'btn';
  editar.textContent = 'Treinos e exercícios';
  editar.onclick = () => abrir('treinos');

  const hist = document.createElement('button');
  hist.className = 'btn';
  hist.textContent = 'Histórico';
  hist.onclick = () => abrir('historico');

  div.append(editar, hist);
  return div;
}

/** Card de um treino na escolha. */
function cardDeTreino(treino, exercicios) {
  const card = document.createElement('div');
  card.className = 'card';

  const cab = document.createElement('div');
  cab.className = 'card-cabecalho';
  if (treino.cor) {
    const marca = document.createElement('span');
    marca.className = 'marca-treino';
    marca.style.background = treino.cor;
    marca.style.marginTop = '7px';
    cab.appendChild(marca);
  }
  const h3 = document.createElement('h3');
  h3.textContent = 'Treino ' + treino.nome;
  cab.appendChild(h3);
  card.appendChild(cab);

  const lista = document.createElement('p');
  lista.className = 'texto-fraco pequeno';
  lista.textContent = treino.itens
    .map((i) => nomeDoItem(i, exercicios) + ' ' + i.seriesPlanejadas + 'x')
    .join(' · ');
  card.appendChild(lista);

  const botoes = document.createElement('div');
  botoes.className = 'linha-botoes';
  botoes.style.marginTop = '10px';

  const iniciar = document.createElement('button');
  iniciar.className = 'btn btn-primario';
  iniciar.textContent = 'Começar hoje';
  iniciar.onclick = () => comecar(treino.id, hojeIso());

  const outraData = document.createElement('button');
  outraData.className = 'btn btn-pequeno';
  outraData.style.flex = '0 0 auto';
  outraData.textContent = 'Outra data';
  outraData.onclick = async () => {
    const dados = await formulario(
      'Registrar treino ' + treino.nome,
      [{ nome: 'data', rotulo: 'Data da sessão', tipo: 'date', valor: hojeIso() }],
      'Registrar'
    );
    if (dados && dados.data) comecar(treino.id, dados.data);
  };

  botoes.append(iniciar, outraData);
  card.appendChild(botoes);
  return card;
}

/** Inicia a sessão e abre o registro. */
async function comecar(treinoId, data) {
  const sessao = await sessoes.iniciarSessao(treinoId, data);
  estado.sessaoId = sessao.id;
  await desenhar();
}

/* --- Registrar a sessão --- */

function desenharSessao() {
  const { sessao } = estado;
  raiz.innerHTML = '';

  raiz.appendChild(cabecalhoDaSessao(sessao));

  const itens = sessao.itens.slice().sort((a, b) => a.ordem - b.ordem);
  itens.forEach((item, i) =>
    raiz.appendChild(cardDeItem(item, i + 1, itens.length))
  );

  raiz.appendChild(rodapeDaSessao(sessao));
}

/** Nome do treino, data e estado. */
function cabecalhoDaSessao(sessao) {
  const card = document.createElement('div');
  card.className = 'card';

  const cab = document.createElement('div');
  cab.className = 'card-cabecalho';
  const h3 = document.createElement('h3');
  h3.textContent = 'Treino ' + sessao.treinoNome;
  cab.appendChild(h3);

  const etq = document.createElement('span');
  etq.className = 'etiqueta';
  const finalizada = sessao.status === sessoes.STATUS.FINALIZADA;
  etq.textContent = finalizada ? 'Finalizada' : 'Em andamento';
  if (!finalizada) etq.classList.add('etiqueta-acento');
  cab.appendChild(etq);
  card.appendChild(cab);

  const data = document.createElement('p');
  data.className = 'texto-fraco pequeno';
  data.style.margin = '0';
  data.textContent = formatarLongo(sessao.data) + ' · ' + descreverDistancia(sessao.data);
  card.appendChild(data);

  return card;
}

/** Card de um exercício com as séries. */
function cardDeItem(item, posicao, total) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.itemId = item.itemId;

  const cab = document.createElement('div');
  cab.className = 'card-cabecalho';

  const ordem = document.createElement('span');
  ordem.className = 'ordem-item';
  ordem.textContent = posicao + 'º';
  ordem.title = 'Posição no treino de hoje';
  cab.appendChild(ordem);

  const h3 = document.createElement('h3');
  h3.textContent = nomeDoExercicio(item);
  cab.appendChild(h3);

  if (item.opcional) {
    const etq = document.createElement('span');
    etq.className = 'etiqueta etiqueta-opcional';
    etq.textContent = 'opcional';
    cab.appendChild(etq);
  }

  cab.appendChild(botaoMover(item, -1, posicao > 1));
  cab.appendChild(botaoMover(item, 1, posicao < total));

  const menu = document.createElement('button');
  menu.className = 'btn btn-icone';
  menu.textContent = '⋯';
  menu.setAttribute('aria-label', 'Opções do exercício');
  menu.onclick = () => menuDoItem(item);
  cab.appendChild(menu);
  card.appendChild(cab);

  if (item.tipo === 'alternativas') {
    card.appendChild(pilulasDeAlternativa(item));
  }

  card.appendChild(linhaUltimaVez(estado.ultimaVezPorExercicio.get(item.exercicioId)));

  const seriesDoItem = seriesDe(item);
  seriesDoItem.forEach((serie) =>
    card.appendChild(linhaDeSerie(item, serie, seriesDoItem))
  );

  card.appendChild(botoesDeSerie(item, seriesDoItem));
  return card;
}

/**
 * Sobe ou desce o exercício. A ordem fica gravada na sessão.
 * @param {boolean} ativo false quando já está na ponta
 */
function botaoMover(item, direcao, ativo) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-icone btn-mover';
  btn.textContent = direcao === -1 ? '↑' : '↓';
  btn.setAttribute(
    'aria-label',
    direcao === -1 ? 'Subir exercício' : 'Descer exercício'
  );
  btn.disabled = !ativo;
  btn.onclick = async () => {
    estado.sessao = await sessoes.moverItem(estado.sessao, item.itemId, direcao);
    await desenhar();
  };
  return btn;
}

/** Nome no card: o exercício ou o grupo. */
function nomeDoExercicio(item) {
  const ex = estado.exercicios.get(item.exercicioId);
  return ex ? ex.nome : nomeDoItem(item, estado.exercicios);
}

/** Pílulas para trocar a alternativa. */
function pilulasDeAlternativa(item) {
  const div = document.createElement('div');
  div.className = 'pilulas';
  item.alternativas.forEach((id) => {
    const btn = document.createElement('button');
    btn.className = 'pilula';
    const ex = estado.exercicios.get(id);
    btn.textContent = ex ? ex.nome : id;
    btn.setAttribute('aria-pressed', String(id === item.exercicioId));
    btn.onclick = async () => {
      if (id === item.exercicioId) return;
      estado.sessao = await sessoes.trocarAlternativa(
        estado.sessao,
        item.itemId,
        id,
        seriesDe(item)
      );
      await desenhar();
    };
    div.appendChild(btn);
  });
  return div;
}

/** "Última vez (há 5 dias · 3º de 8): 60×10 60×9". */
function linhaUltimaVez(ultima) {
  const p = document.createElement('p');
  p.className = 'texto-fraco pequeno';
  if (!ultima) {
    p.textContent = 'Primeira vez neste exercício.';
    return p;
  }
  const resumo = ultima.series
    .filter((s) => !s.aquecimento)
    .map((s) => (num(s.carga, 2) || '—') + '×' + (s.reps === null ? '—' : s.reps))
    .join('   ');
  p.textContent =
    'Última vez (' +
    descreverDistancia(ultima.sessao.data) +
    posicaoNaquelaVez(ultima) +
    '): ' +
    resumo;
  return p;
}

/** " · 3º de 8", ou '' se a sessão antiga não guardou a ordem. */
function posicaoNaquelaVez(ultima) {
  const ordem = ultima.series[0] ? ultima.series[0].ordemItem : null;
  const total = (ultima.sessao.itens ?? []).length;
  if (ordem === null || ordem === undefined || !total) return '';
  return ' · ' + (ordem + 1) + 'º de ' + total;
}

/** Séries do item, em ordem. */
function seriesDe(item) {
  return estado.series.filter((s) => s.itemId === item.itemId);
}

/** Linha editável de uma série. */
function linhaDeSerie(item, serie, seriesDoItem) {
  const ex = estado.exercicios.get(item.exercicioId);
  const unidade = ROTULO_CARGA[(ex && ex.tipoCarga) || 'carga'];

  const linha = document.createElement('div');
  linha.className = 'serie' + (serie.aquecimento ? ' aquecimento' : '');

  const numero = document.createElement('button');
  numero.className = 'serie-numero';
  numero.textContent = (serie.aquecimento ? 'aq ' : '') + serie.numero;
  numero.title = serie.aquecimento
    ? 'Deixar de ser aquecimento'
    : 'Marcar como aquecimento (vai para o começo)';
  numero.onclick = async () => {
    await sessoes.alternarAquecimentoDaSerie(serie.id, seriesDoItem);
    await desenhar();
  };

  const carga = campoNumerico(serie.carga, unidade, async (valor) => {
    serie.carga = valor;
    await sessoes.atualizarSerie({ ...serie, carga: valor });
  });

  const reps = campoNumerico(serie.reps, 'reps', async (valor) => {
    serie.reps = valor;
    await sessoes.atualizarSerie({ ...serie, reps: valor });
  });

  const remover = document.createElement('button');
  remover.className = 'btn btn-icone';
  remover.textContent = '×';
  remover.setAttribute('aria-label', 'Remover série');
  remover.onclick = async () => {
    await sessoes.apagarSerie(serie.id, seriesDoItem);
    await desenhar();
  };

  linha.append(numero, carga, reps, remover);
  return linha;
}

/**
 * Campo numérico que salva sozinho (ao digitar e ao sair).
 * @param {number|null} valor
 * @param {string} unidade rótulo à direita
 * @param {(v: number|null) => Promise<void>} aoMudar
 */
function campoNumerico(valor, unidade, aoMudar) {
  const wrap = document.createElement('div');
  wrap.className = 'campo';
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.value =
    valor === null || valor === undefined ? '' : String(valor).replace('.', ',');
  input.placeholder = '—';
  let timer = null;
  const salvar = () => aoMudar(paraNumero(input.value));
  input.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(salvar, 400);
  };
  input.onblur = () => {
    clearTimeout(timer);
    salvar();
  };
  const un = document.createElement('span');
  un.className = 'unidade';
  un.textContent = unidade;
  wrap.append(input, un);
  return wrap;
}

/** Botões "+ série" e "+ aquecimento". */
function botoesDeSerie(item, seriesDoItem) {
  const div = document.createElement('div');
  div.className = 'linha-botoes';
  div.style.marginTop = '10px';

  const feitas = seriesDoItem.filter((s) => !s.aquecimento).length;
  const restantes = item.seriesPlanejadas - feitas;

  const add = document.createElement('button');
  add.className = 'btn btn-pequeno';
  add.textContent = restantes > 0 ? '+ série (faltam ' + restantes + ')' : '+ série';
  add.onclick = async () => {
    await sessoes.adicionarSerie(estado.sessao, item, seriesDoItem, false);
    await desenhar();
  };

  const aq = document.createElement('button');
  aq.className = 'btn btn-pequeno';
  aq.textContent = '+ aquecimento';
  aq.onclick = async () => {
    await sessoes.adicionarSerie(estado.sessao, item, seriesDoItem, true);
    await desenhar();
  };

  div.append(add, aq);
  return div;
}

/** Menu do exercício na sessão. */
async function menuDoItem(item) {
  const acao = await escolher(nomeDoExercicio(item), [
    { valor: 'substituir', rotulo: 'Substituir por outro exercício' },
    { valor: 'remover', rotulo: 'Remover da sessão' },
  ]);

  if (acao === 'substituir') return substituir(item);

  if (acao === 'remover') {
    const ok = await confirmar(
      'Remover exercício?',
      'As séries registradas para ele serão apagadas. O modelo do treino não muda.'
    );
    if (!ok) return;
    estado.sessao = await sessoes.removerItem(estado.sessao, item.itemId, seriesDe(item));
    await desenhar();
  }
}

/** Troca o exercício mantendo o lugar dele no treino. */
async function substituir(item) {
  const todos = await listarExercicios();
  const jaNaSessao = new Set(estado.sessao.itens.map((i) => i.exercicioId));

  const id = await escolherComBusca(
    'Fiz outro exercício no lugar de…',
    todos
      .filter((e) => e.id === item.exercicioId || !jaNaSessao.has(e.id))
      .filter((e) => e.id !== item.exercicioId)
      .map((e) => ({ valor: e.id, rotulo: e.nome }))
  );
  if (!id) return;

  const series = seriesDe(item);
  let oQueFazer = 'mover';

  if (series.length) {
    const escolha = await escolher(
      `Já há ${series.length} série${series.length > 1 ? 's' : ''} registrada${series.length > 1 ? 's' : ''} aqui`,
      [
        { valor: 'mover', rotulo: 'Aproveitar as séries no exercício novo' },
        { valor: 'apagar', rotulo: 'Apagar as séries e começar do zero' },
      ]
    );
    if (!escolha) return;
    oQueFazer = escolha;
  }

  estado.sessao = await sessoes.substituirExercicio(
    estado.sessao,
    item.itemId,
    id,
    series,
    oQueFazer
  );
  await desenhar();
}

/** Anotação, adicionar exercício, finalizar e excluir. */
function rodapeDaSessao(sessao) {
  const card = document.createElement('div');
  card.className = 'card';

  const linha = document.createElement('div');
  linha.className = 'form-linha';
  const label = document.createElement('label');
  label.textContent = 'Anotação da sessão';
  const ta = document.createElement('textarea');
  ta.className = 'entrada';
  ta.value = sessao.anotacao || '';
  ta.placeholder = 'Como foi o treino?';
  let timer = null;
  ta.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      estado.sessao = { ...estado.sessao, anotacao: ta.value };
      sessoes.atualizarSessao(estado.sessao);
    }, 500);
  };
  linha.append(label, ta);
  card.appendChild(linha);

  const botoes = document.createElement('div');
  botoes.className = 'linha-botoes';

  const addEx = document.createElement('button');
  addEx.className = 'btn';
  addEx.textContent = '+ exercício';
  addEx.onclick = async () => {
    const todos = await listarExercicios();
    const jaNaSessao = new Set(estado.sessao.itens.map((i) => i.exercicioId));
    const id = await escolherComBusca(
      'Adicionar exercício',
      todos
        .filter((e) => !jaNaSessao.has(e.id))
        .map((e) => ({ valor: e.id, rotulo: e.nome }))
    );
    if (!id) return;
    estado.sessao = await sessoes.adicionarExercicio(estado.sessao, id);
    await desenhar();
  };
  botoes.appendChild(addEx);

  if (sessao.status === sessoes.STATUS.FINALIZADA) {
    const reabrir = document.createElement('button');
    reabrir.className = 'btn';
    reabrir.textContent = 'Reabrir';
    reabrir.onclick = async () => {
      estado.sessao = await sessoes.reabrirSessao(estado.sessao);
      await desenhar();
    };
    botoes.appendChild(reabrir);

    const voltar = document.createElement('button');
    voltar.className = 'btn btn-primario';
    voltar.textContent = 'Voltar';
    voltar.onclick = () => sair();
    botoes.appendChild(voltar);
  } else {
    const finalizar = document.createElement('button');
    finalizar.className = 'btn btn-primario';
    finalizar.textContent = 'Finalizar sessão';
    finalizar.onclick = async () => {
      await sessoes.finalizarSessao(estado.sessao);
      await sair();
    };
    botoes.appendChild(finalizar);
  }

  card.appendChild(botoes);

  const apagar = document.createElement('button');
  apagar.className = 'btn btn-perigo btn-bloco';
  apagar.style.marginTop = '8px';
  apagar.textContent = 'Excluir sessão';
  apagar.onclick = async () => {
    const ok = await confirmar(
      'Excluir sessão?',
      'Todas as séries registradas nesta sessão serão apagadas.'
    );
    if (!ok) return;
    await sessoes.apagarSessao(estado.sessao.id);
    await sair();
  };
  card.appendChild(apagar);

  return card;
}

/** Fecha a sessão: volta para a tela anterior ou para a escolha de treino. */
async function sair() {
  if (estado.veioDeOutraTela) {
    estado.veioDeOutraTela = false;
    estado.sessaoId = null;
    await voltarUmaTela();
    return;
  }
  estado.sessaoId = null;
  await desenhar();
}


/* --- Aviso do backup --- */

/**
 * Faixa no topo quando o backup no Dropbox falhou.
 * Faixa e não diálogo, para não atrapalhar o treino. Pendente por falta de
 * rede não é erro e não aparece.
 */
function avisarSeOBackupFalhou() {
  if (!raiz) return;

  import('../sync/dropbox-estado.js')
    .then(({ lerEstado }) => {
      const estadoBackup = lerEstado();
      if (!estadoBackup.refreshToken || !estadoBackup.ultimoErro) return;
      if (!raiz || raiz.querySelector('.aviso-backup')) return;
      raiz.prepend(faixaDeAviso(estadoBackup.ultimoErro));
    })
    .catch(() => {
      /* Sem backup configurado, não há aviso. */
    });
}

/** A faixa: toca para abrir o Dropbox. */
function faixaDeAviso(mensagem) {
  const faixa = document.createElement('button');
  faixa.className = 'aviso-backup';
  faixa.title = mensagem;

  const texto = document.createElement('span');
  texto.textContent = '⚠︎ O backup no Dropbox não está saindo.';
  faixa.appendChild(texto);

  const acao = document.createElement('span');
  acao.className = 'pequeno';
  acao.textContent = 'ver';
  faixa.appendChild(acao);

  faixa.onclick = () => abrir('dropbox');
  return faixa;
}
