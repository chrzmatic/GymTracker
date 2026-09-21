/**
 * Aba Comparar: duas sessões lado a lado.
 *
 * A tela abre já sugerindo a comparação mais útil — as duas sessões mais
 * recentes do mesmo treino — e deixa trocar qualquer uma das duas.
 *
 * Verde é melhora, vermelho é piora, cinza é igual. Em exercício
 * assistido, "melhora" quer dizer mais carga efetiva, ou seja, menos
 * assistência.
 */

import * as comparacao from '../services/comparacao-service.js';
import { ESTADO } from '../domain/comparacao.js';
import { formatarLongo, descreverDistancia } from '../utils/date.js';
import { num, comSinal, percentual } from '../utils/format.js';
import { escolher } from '../components/dialogo.js';
import { abrir } from '../navegacao.js';

/** Sessões escolhidas. Guardado entre montagens. */
const estado = { idA: null, idB: null };

let raiz = null;

/**
 * Renderiza a aba Comparar.
 * @param {HTMLElement} elemento
 * @param {{idA?: string, idB?: string}} [params]
 * @returns {Promise<void>}
 */
export async function montarComparar(elemento, params = {}) {
  raiz = elemento;
  if (params.idA) estado.idA = params.idA;
  if (params.idB) estado.idB = params.idB;

  if (!estado.idA || !estado.idB) {
    const sugestao = await comparacao.sugestaoDeComparacao();
    if (sugestao) {
      estado.idA = sugestao.a.id;
      estado.idB = sugestao.b.id;
    }
  }

  await desenhar();
}

/** Relê as sessões e redesenha. */
async function desenhar() {
  raiz.innerHTML = '';

  if (!estado.idA || !estado.idB) {
    raiz.innerHTML =
      '<div class="vazio">Registre pelo menos duas sessões do mesmo treino para comparar.</div>';
    raiz.appendChild(botoesDeEscolha());
    return;
  }

  const r = await comparacao.comparar(estado.idA, estado.idB);
  if (!r) {
    estado.idA = null;
    estado.idB = null;
    await desenhar();
    return;
  }

  raiz.appendChild(cabecalho(r));
  raiz.appendChild(cardDeTotal(r));

  const comparados = r.itens.filter((i) => i.estado === ESTADO.COMPARADO);
  const outros = r.itens.filter((i) => i.estado !== ESTADO.COMPARADO);

  comparados.forEach((i) => raiz.appendChild(cardDeExercicio(i)));
  if (outros.length) {
    const h = document.createElement('h2');
    h.textContent = 'Diferenças entre as sessões';
    h.style.margin = '18px 0 8px';
    raiz.appendChild(h);
    outros.forEach((i) => raiz.appendChild(cardDeExercicio(i)));
  }

  avisos(r).forEach((faixa) => raiz.appendChild(faixa));
  raiz.appendChild(botoesDeEscolha());
}

/* ------------------------------------------------------------------ */
/* Cabeçalho e escolha das sessões                                     */
/* ------------------------------------------------------------------ */

function cabecalho(r) {
  const card = document.createElement('div');
  card.className = 'card';

  const linha = document.createElement('div');
  linha.className = 'comparar-cabecalho';
  linha.append(
    ladoDaSessao(r.sessaoA, 'antes'),
    seta(),
    ladoDaSessao(r.sessaoB, 'depois')
  );
  card.appendChild(linha);

  return card;
}

/** Um lado do cabeçalho, clicável para abrir a sessão. */
function ladoDaSessao(sessao, papel) {
  const div = document.createElement('button');
  div.className = 'comparar-lado';
  div.onclick = () => abrir('treino', { sessaoId: sessao.id });

  const etq = document.createElement('span');
  etq.className = 'texto-fraco pequeno';
  etq.textContent = papel;
  div.appendChild(etq);

  const nome = document.createElement('strong');
  nome.textContent = 'Treino ' + sessao.treinoNome;
  div.appendChild(nome);

  const data = document.createElement('span');
  data.className = 'texto-fraco pequeno';
  data.textContent = formatarLongo(sessao.data);
  div.appendChild(data);

  const distancia = document.createElement('span');
  distancia.className = 'texto-fraco pequeno';
  distancia.textContent = descreverDistancia(sessao.data);
  div.appendChild(distancia);

  return div;
}

function seta() {
  const span = document.createElement('span');
  span.className = 'comparar-seta';
  span.textContent = '→';
  return span;
}

/** Botões para trocar cada lado da comparação. */
function botoesDeEscolha() {
  const div = document.createElement('div');
  div.className = 'linha-botoes';
  div.style.marginTop = '16px';

  const trocarA = document.createElement('button');
  trocarA.className = 'btn';
  trocarA.textContent = 'Trocar "antes"';
  trocarA.onclick = () => escolherSessao('idA');

  const trocarB = document.createElement('button');
  trocarB.className = 'btn';
  trocarB.textContent = 'Trocar "depois"';
  trocarB.onclick = () => escolherSessao('idB');

  div.append(trocarA, trocarB);
  return div;
}

/**
 * Abre a lista de sessões para escolher um dos lados.
 * @param {'idA'|'idB'} lado
 */
async function escolherSessao(lado) {
  const sessoes = await comparacao.listarParaComparar();
  const outro = lado === 'idA' ? estado.idB : estado.idA;

  const opcoes = sessoes
    .filter((s) => s.id !== outro)
    .map((s) => ({
      valor: s.id,
      rotulo: 'Treino ' + s.treinoNome,
      detalhe: formatarLongo(s.data),
    }));

  if (!opcoes.length) return;

  const id = await escolher('Escolher sessão', opcoes);
  if (!id) return;
  estado[lado] = id;
  await desenhar();
}

/* ------------------------------------------------------------------ */
/* Tabelas                                                             */
/* ------------------------------------------------------------------ */

/** Card do total da sessão. */
function cardDeTotal(r) {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = 'Total da sessão';
  h3.style.margin = '0 0 8px';
  card.appendChild(h3);

  r.total.metricas.forEach((m) => card.appendChild(linhaDeMetrica(m)));
  return card;
}

/**
 * Card de um exercício.
 * @param {Object} item resultado da comparação
 * @returns {HTMLElement}
 */
function cardDeExercicio(item) {
  const card = document.createElement('div');
  card.className = 'card';

  const cab = document.createElement('div');
  cab.className = 'card-cabecalho';

  const h3 = document.createElement('h3');
  h3.textContent = item.nome;
  cab.appendChild(h3);

  const etiqueta = etiquetaDoEstado(item);
  if (etiqueta) cab.appendChild(etiqueta);
  card.appendChild(cab);

  if (item.ordemA && item.ordemB && item.ordemA !== item.ordemB) {
    const ordem = document.createElement('p');
    ordem.className = 'texto-fraco pequeno';
    ordem.style.margin = '0 0 8px';
    ordem.textContent = `Era o ${item.ordemA}º do treino, agora é o ${item.ordemB}º.`;
    card.appendChild(ordem);
  }

  if (item.estado === ESTADO.DIFERENTE) {
    const nota = document.createElement('p');
    nota.className = 'texto-fraco pequeno';
    nota.style.margin = '0';
    nota.textContent = item.eraGrupo
      ? `Alternativas diferentes: ${item.nomeA} antes, ${item.nomeB} depois. Sem comparação direta.`
      : `Você fez ${item.nomeB} no lugar de ${item.nomeA}, na mesma vaga do treino. São exercícios diferentes, então não há comparação direta.`;
    card.appendChild(nota);
    card.appendChild(resumoSimples(item));
    return card;
  }

  if (item.estado === ESTADO.PULADO) {
    const nota = document.createElement('p');
    nota.className = 'texto-fraco pequeno';
    nota.style.margin = '0';
    nota.textContent = item.a.series
      ? 'Pulado na sessão mais nova.'
      : 'Pulado na sessão mais antiga.';
    card.appendChild(nota);
    card.appendChild(resumoSimples(item));
    return card;
  }

  if (!item.metricas) {
    card.appendChild(resumoSimples(item));
    return card;
  }

  item.metricas.forEach((m) => card.appendChild(linhaDeMetrica(m)));
  return card;
}

/** Etiqueta "adicionado", "removido", "pulado (opcional)"… */
function etiquetaDoEstado(item) {
  const textos = {
    [ESTADO.ADICIONADO]: 'adicionado',
    [ESTADO.REMOVIDO]: 'removido',
    [ESTADO.DIFERENTE]: item.eraGrupo ? 'alternativa diferente' : 'exercício substituído',
    [ESTADO.PULADO]: item.opcional ? 'pulado (opcional)' : 'pulado',
  };
  const texto = textos[item.estado];
  if (!texto) return null;

  const span = document.createElement('span');
  span.className = 'etiqueta';
  if (item.estado === ESTADO.PULADO || item.estado === ESTADO.DIFERENTE) {
    span.classList.add('etiqueta-opcional');
  }
  span.textContent = texto;
  return span;
}

/** Resumo de um lado só, quando não dá para comparar número a número. */
function resumoSimples(item) {
  const div = document.createElement('div');
  div.className = 'comparar-simples';

  const lado = (m, rotulo) => {
    const p = document.createElement('p');
    p.className = 'texto-fraco pequeno';
    p.style.margin = '4px 0 0';
    p.textContent = m.series
      ? `${rotulo}: ${m.series} séries, ${m.reps} reps` +
        (m.volume !== null ? `, volume ${num(m.volume, 0)} kg` : '')
      : `${rotulo}: não feito`;
    return p;
  };

  div.append(lado(item.a, 'Antes'), lado(item.b, 'Depois'));
  return div;
}

/**
 * Uma linha de métrica: rótulo, os dois valores, a diferença e o percentual.
 * @param {Object} m
 * @returns {HTMLElement}
 */
function linhaDeMetrica(m) {
  const linha = document.createElement('div');
  linha.className = 'metrica';

  const rotulo = document.createElement('span');
  rotulo.className = 'metrica-rotulo';
  rotulo.textContent = m.rotulo;
  linha.appendChild(rotulo);

  const antes = document.createElement('span');
  antes.className = 'metrica-valor';
  antes.textContent = valor(m.antes, m.unidade);
  linha.appendChild(antes);

  const depois = document.createElement('span');
  depois.className = 'metrica-valor';
  depois.textContent = valor(m.depois, m.unidade);
  linha.appendChild(depois);

  const dif = document.createElement('span');
  dif.className = 'metrica-dif ' + m.direcao;
  dif.textContent =
    m.absoluta === null
      ? '—'
      : comSinal(m.absoluta, 1) + (m.percentual === null ? '' : ` (${percentual(m.percentual)})`);
  linha.appendChild(dif);

  return linha;
}

/** Formata um valor da tabela. */
function valor(v, unidade) {
  if (v === null || v === undefined) return '—';
  return num(v, 1) + (unidade ? ' ' + unidade : '');
}

/**
 * Faixas de aviso sobre dados que faltam.
 *
 * Uma por causa, porque a solução de cada uma é diferente: registrar o
 * peso corporal, preencher o kg de uma série, ou anotar as reps.
 *
 * @param {Object} r resultado da comparação
 * @returns {HTMLElement[]}
 */
function avisos(r) {
  const faltando = r.faltando ?? { pesoCorporal: 0, carga: 0, reps: 0 };
  const faixas = [];

  const faixa = (texto) => {
    const div = document.createElement('div');
    div.className = 'faixa-aviso';
    div.textContent = texto;
    return div;
  };

  const series = (n) => `${n} série${n > 1 ? 's' : ''}`;

  if (faltando.pesoCorporal) {
    faixas.push(
      faixa(
        `${series(faltando.pesoCorporal)} são de peso corporal ou assistido e não têm peso registrado até a data da sessão. Para elas, a comparação usa só reps e o kg registrado. Registre seu peso em ⚙︎ → Peso corporal.`
      )
    );
  }

  if (faltando.carga) {
    faixas.push(
      faixa(
        `${series(faltando.carga)} estão sem o kg anotado. Elas contam nas séries e nas reps, mas ficam fora do volume e do 1RM.`
      )
    );
  }

  if (faltando.reps) {
    faixas.push(
      faixa(
        `${series(faltando.reps)} estão sem as reps anotadas. Elas contam nas séries e na carga máxima, mas ficam fora do volume e do 1RM — o app não chuta que foram zero.`
      )
    );
  }

  return faixas;
}
