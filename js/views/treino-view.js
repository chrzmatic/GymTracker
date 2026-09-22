/**
 * Aba Treino: tela inicial do app.
 *
 * Dois estados:
 *  - sem sessão aberta: escolher um treino para começar (ou retomar)
 *  - com sessão aberta: registrar as séries
 *
 * Tudo é salvo a cada alteração, então sair do app no meio não perde nada.
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

/** Estado local da tela. O banco continua sendo a fonte da verdade. */
const estado = {
  sessaoId: null,
  sessao: null,
  series: [],
  exercicios: new Map(),
  ultimaVezPorExercicio: new Map(),
  /** true quando a sessão foi aberta pelo histórico, e não é a do dia. */
  veioDeOutraTela: false,
};

let raiz = null;

/**
 * Renderiza a aba Treino dentro do elemento informado.
 *
 * Com `params.sessaoId` abre aquela sessão específica — é assim que o
 * histórico (e o calendário, na Etapa 3) abrem uma sessão passada. Sem
 * parâmetro, retoma a sessão em andamento, se houver.
 *
 * @param {HTMLElement} elemento
 * @param {{sessaoId?: string}} [params]
 * @returns {Promise<void>}
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

/**
 * Recarrega os dados da sessão e redesenha a tela.
 *
 * O aviso do backup entra por último, depois de a tela estar pronta, e
 * vale para os dois caminhos (escolher treino e sessão aberta), porque os
 * dois começam limpando a raiz.
 */
async function desenhar() {
  await desenharConteudo();
  avisarSeOBackupFalhou();
}

/** O desenho da tela em si. */
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

/** Busca, para cada exercício da sessão, o que foi feito da última vez. */
async function carregarUltimasVezes() {
  const ids = [...new Set(estado.sessao.itens.map((i) => i.exercicioId).filter(Boolean))];
  estado.ultimaVezPorExercicio = await sessoes.ultimasVezes(estado.sessao, ids);
}

/* ------------------------------------------------------------------ */
/* Tela 1: escolher o treino                                           */
/* ------------------------------------------------------------------ */

async function desenharEscolhaDeTreino() {
  const hoje = hojeIso();
  const deHoje = await sessoes.listarSessoesDaData(hoje);

  // Se já treinou hoje, a sugestão passa para amanhã (ver o domínio).
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

  const outro = document.createElement('p');
  outro.className = 'texto-fraco pequeno';
  outro.style.margin = '18px 0 0';
  outro.textContent = sugestao
    ? 'Ou escolha outro treino:'
    : 'Escolha o treino de hoje para começar a registrar.';
  raiz.appendChild(outro);

  secao('Rotação', rotacao);
  secao('Extras', extras);
  raiz.appendChild(atalhosDeGestao());
}

/**
 * Card com o que já foi treinado hoje, quando há sessão do dia.
 * @param {Object[]} deHoje sessões de hoje
 * @returns {HTMLElement}
 */
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
 * Card em destaque com o treino sugerido.
 *
 * O dia da sugestão depende do que já aconteceu: se ainda não treinou hoje,
 * a sugestão é para hoje; se já treinou, ela passa a ser para amanhã, já
 * contando o treino de hoje na sequência.
 *
 * A sugestão é só uma sugestão: os treinos todos continuam listados
 * embaixo, e escolher outro não quebra nada — a rotação se orienta pelo
 * que foi realmente registrado, não pelo que foi sugerido.
 *
 * @param {Object} sugestao resultado de sugestaoPara
 * @param {Map<string, Object>} exercicios
 * @param {boolean} paraAmanha true quando já houve treino hoje
 * @returns {HTMLElement}
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
  // Mesmo com a sugestão virada para amanhã, o botão registra hoje: mais de
  // uma sessão no mesmo dia é permitido, e treinar de novo hoje é o caso
  // real (segunda sessão, treino extra). Registrar amanhã não faz sentido.
  botao.textContent = paraAmanha
    ? 'Fazer o ' + sugestao.treino.nome + ' hoje mesmo'
    : 'Começar treino ' + sugestao.treino.nome;
  botao.onclick = () => comecar(sugestao.treino.id, hojeIso());
  card.appendChild(botao);

  return card;
}


/** Atalhos para editar os modelos e ver o histórico. */
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

/**
 * Card de um treino na tela de escolha.
 * @param {Object} treino
 * @param {Map<string, Object>} exercicios
 * @returns {HTMLElement}
 */
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

/**
 * Inicia uma sessão e abre a tela de registro.
 * @param {string} treinoId
 * @param {string} data AAAA-MM-DD
 */
async function comecar(treinoId, data) {
  const sessao = await sessoes.iniciarSessao(treinoId, data);
  estado.sessaoId = sessao.id;
  await desenhar();
}

/* ------------------------------------------------------------------ */
/* Tela 2: registrar a sessão                                          */
/* ------------------------------------------------------------------ */

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

/** Cabeçalho com nome do treino, data e estado. */
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

/** Card de um exercício (ou grupo de alternativas) com suas séries. */
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
 * Botão de subir/descer o exercício na sessão.
 *
 * A ordem importa de verdade num treino full body: o que fica para o fim
 * pega a fadiga acumulada e rende menos. Por isso dá para reordenar durante
 * o treino, e a ordem fica gravada na sessão.
 *
 * @param {Object} item
 * @param {-1|1} direcao
 * @param {boolean} ativo false quando o item já está na ponta
 * @returns {HTMLElement}
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

/** Nome mostrado no card: o exercício escolhido, ou o nome do grupo. */
function nomeDoExercicio(item) {
  const ex = estado.exercicios.get(item.exercicioId);
  return ex ? ex.nome : nomeDoItem(item, estado.exercicios);
}

/** Pílulas para trocar a alternativa com um toque. */
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

/**
 * Linha "Última vez (há 5 dias · 3º): 60×10  60×9".
 *
 * Mostra também em que posição do treino o exercício foi feito naquele dia,
 * porque é essa a informação que justifica reordenar: um exercício que
 * rendeu pouco em 7º lugar pode render mais em 2º.
 */
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

/**
 * Trecho " · 3º de 8" com a posição que o exercício ocupou naquela sessão.
 * Devolve string vazia se a sessão antiga não guardou a ordem.
 * @param {{sessao: Object, series: Object[]}} ultima
 * @returns {string}
 */
function posicaoNaquelaVez(ultima) {
  const ordem = ultima.series[0] ? ultima.series[0].ordemItem : null;
  const total = (ultima.sessao.itens ?? []).length;
  if (ordem === null || ordem === undefined || !total) return '';
  return ' · ' + (ordem + 1) + 'º de ' + total;
}

/** Séries já registradas para um item, na ordem de exibição. */
function seriesDe(item) {
  return estado.series.filter((s) => s.itemId === item.itemId);
}

/** Uma linha editável de série. */
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
 * Campo numérico que salva sozinho (ao digitar, com pequeno atraso, e ao sair).
 * @param {number|null} valor
 * @param {string} unidade rótulo curto à direita
 * @param {(v: number|null) => Promise<void>} aoMudar
 * @returns {HTMLElement}
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

/** Menu de opções do exercício dentro da sessão. */
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

/**
 * Troca o exercício mantendo o lugar dele no treino.
 *
 * É diferente de remover e adicionar: como a vaga do treino é a mesma, a
 * comparação entre sessões mostra "exercício diferente" naquele lugar, em
 * vez de um removido e um adicionado soltos.
 *
 * @param {Object} item
 */
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

/** Anotação geral, adicionar exercício, finalizar e excluir. */
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

/**
 * Fecha a sessão aberta.
 *
 * Se ela foi aberta pelo histórico, volta para lá (a pilha de navegação
 * cuida disso). Se é a sessão do dia, volta para a lista de treinos da aba.
 * @returns {Promise<void>}
 */
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


/* ------------------------------------------------------------------ */
/* Aviso do backup                                                     */
/* ------------------------------------------------------------------ */

/**
 * Faixa discreta no topo quando o último backup no Dropbox não saiu.
 *
 * A especificação pede isso aqui, e não num diálogo, por um motivo
 * concreto: o backup falha justamente no lugar onde a internet é ruim, a
 * academia, e um modal no meio de uma série seria a pior interrupção
 * possível. A faixa informa e sai do caminho — dá para treinar o dia
 * inteiro sem tocar nela.
 *
 * Só aparece quando há erro de verdade. "Pendente" por falta de rede é o
 * funcionamento normal e não vira aviso.
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
      /* sem backup configurado, não há aviso a dar */
    });
}

/**
 * A faixa em si: toca para ir às configurações do Dropbox.
 * @param {string} mensagem
 * @returns {HTMLElement}
 */
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
