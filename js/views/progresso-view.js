/**
 * Aba Progresso: gráfico por exercício, resumo semanal e séries por músculo.
 *
 * O Chart.js é carregado sob demanda, na primeira vez que a aba abre: são
 * 208 KB que não fazem falta enquanto você está registrando o treino.
 */

import * as progresso from '../services/progresso-service.js';
import { PERIODO } from '../domain/progressao.js';
import { formatarCurto, formatarLongo, somarDias, hojeIso } from '../utils/date.js';
import { num, comSinal, percentual } from '../utils/format.js';
import { escolherComBusca, escolher } from '../components/dialogo.js';
import { blocoVazio } from '../components/ui.js';

/** Estado da tela, guardado entre montagens. */
const estado = {
  exercicioId: null,
  periodo: PERIODO.TRES_MESES,
  metrica: 'cargaMaxima',
  semana: null,
  secao: 'grafico',
};

let raiz = null;
/** Instância do Chart.js viva, para destruir antes de redesenhar. */
let grafico = null;

/** Métricas que o gráfico sabe desenhar. */
const METRICAS = [
  { id: 'cargaMaxima', rotulo: 'Carga máxima', unidade: 'kg' },
  { id: 'volume', rotulo: 'Volume', unidade: 'kg' },
  { id: 'rm', rotulo: '1RM estimado', unidade: 'kg' },
];

const PERIODOS = [
  { id: PERIODO.QUATRO_SEMANAS, rotulo: '4 semanas' },
  { id: PERIODO.TRES_MESES, rotulo: '3 meses' },
  { id: PERIODO.TUDO, rotulo: 'Tudo' },
];

/**
 * Carrega o Chart.js uma vez só.
 * @returns {Promise<Function>}
 */
async function carregarChart() {
  if (window.Chart) return window.Chart;
  await new Promise((ok, erro) => {
    const script = document.createElement('script');
    script.src = new URL('../../lib/chart.umd.min.js', import.meta.url).href;
    script.onload = ok;
    script.onerror = () => erro(new Error('Não consegui carregar o Chart.js.'));
    document.head.appendChild(script);
  });
  return window.Chart;
}

/**
 * Renderiza a aba Progresso.
 * @param {HTMLElement} elemento
 * @returns {Promise<void>}
 */
export async function montarProgresso(elemento) {
  raiz = elemento;
  await desenhar();
}

/** Redesenha a partir do banco. */
async function desenhar() {
  // Um Chart.js vivo continua desenhando num canvas já removido do DOM,
  // então ele precisa ser destruído antes de refazer a tela.
  if (grafico) {
    grafico.destroy();
    grafico = null;
  }
  raiz.innerHTML = '';
  raiz.appendChild(abas());

  if (estado.secao === 'grafico') return await desenharGrafico();
  if (estado.secao === 'semanas') return await desenharSemanas();
  return await desenharMusculos();
}

/** Seletor das três seções da aba. */
function abas() {
  const div = document.createElement('div');
  div.className = 'pilulas';

  [
    { id: 'grafico', rotulo: 'Exercício' },
    { id: 'musculos', rotulo: 'Séries por músculo' },
    { id: 'semanas', rotulo: 'Semanas' },
  ].forEach((secao) => {
    const btn = document.createElement('button');
    btn.className = 'pilula';
    btn.textContent = secao.rotulo;
    btn.setAttribute('aria-pressed', String(estado.secao === secao.id));
    btn.onclick = async () => {
      estado.secao = secao.id;
      await desenhar();
    };
    div.appendChild(btn);
  });

  return div;
}

/* ------------------------------------------------------------------ */
/* Gráfico por exercício                                               */
/* ------------------------------------------------------------------ */

async function desenharGrafico() {
  const disponiveis = await progresso.listarExerciciosComHistorico();

  if (!disponiveis.length) {
    raiz.appendChild(blocoVazio('Registre algumas sessões para ver a progressão.'));
    return;
  }

  if (!estado.exercicioId || !disponiveis.some((e) => e.id === estado.exercicioId)) {
    estado.exercicioId = disponiveis[0].id;
  }

  const dados = await progresso.progressaoDoExercicio(estado.exercicioId, estado.periodo);

  const seletor = document.createElement('button');
  seletor.className = 'btn btn-bloco';
  seletor.style.marginTop = '12px';
  seletor.textContent = dados.nome + '  ▾';
  seletor.onclick = async () => {
    const id = await escolherComBusca(
      'Escolher exercício',
      disponiveis.map((e) => ({
        valor: e.id,
        rotulo: e.nome,
        detalhe: `${e.sessoes} sessões`,
      }))
    );
    if (!id) return;
    estado.exercicioId = id;
    await desenhar();
  };
  raiz.appendChild(seletor);

  raiz.appendChild(filtros());

  const card = document.createElement('div');
  card.className = 'card';
  card.style.marginTop = '12px';

  if (dados.pontos.length < 2) {
    const aviso = document.createElement('p');
    aviso.className = 'texto-fraco pequeno';
    aviso.style.margin = '0';
    aviso.textContent =
      dados.total < 2
        ? 'Este exercício só tem uma sessão registrada. O gráfico aparece a partir da segunda.'
        : 'Nenhuma sessão neste período. Escolha um período maior.';
    card.appendChild(aviso);
    raiz.appendChild(card);
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.style.maxHeight = '260px';
  card.appendChild(canvas);
  raiz.appendChild(card);

  raiz.appendChild(cardDeVariacao(dados));
  raiz.appendChild(tabelaDePontos(dados));

  await pintarGrafico(canvas, dados);
}

/** Pílulas de período e de métrica. */
function filtros() {
  const div = document.createElement('div');
  div.style.marginTop = '10px';

  const linhaPeriodo = document.createElement('div');
  linhaPeriodo.className = 'pilulas';
  PERIODOS.forEach((p) => {
    const btn = document.createElement('button');
    btn.className = 'pilula';
    btn.textContent = p.rotulo;
    btn.setAttribute('aria-pressed', String(estado.periodo === p.id));
    btn.onclick = async () => {
      estado.periodo = p.id;
      await desenhar();
    };
    linhaPeriodo.appendChild(btn);
  });
  div.appendChild(linhaPeriodo);

  const linhaMetrica = document.createElement('div');
  linhaMetrica.className = 'pilulas';
  METRICAS.forEach((m) => {
    const btn = document.createElement('button');
    btn.className = 'pilula';
    btn.textContent = m.rotulo;
    btn.setAttribute('aria-pressed', String(estado.metrica === m.id));
    btn.onclick = async () => {
      estado.metrica = m.id;
      await desenhar();
    };
    linhaMetrica.appendChild(btn);
  });
  div.appendChild(linhaMetrica);

  return div;
}

/**
 * Desenha a linha no canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {Object} dados
 */
async function pintarGrafico(canvas, dados) {
  const Chart = await carregarChart();
  const metrica = METRICAS.find((m) => m.id === estado.metrica);

  const pontos = dados.pontos.map((p) => ({ x: formatarCurto(p.data), y: p[estado.metrica] }));
  const temAlgum = pontos.some((p) => p.y !== null && p.y !== undefined);

  if (!temAlgum) {
    const aviso = document.createElement('p');
    aviso.className = 'texto-fraco pequeno';
    aviso.textContent =
      'Sem dados para esta métrica. Exercícios de peso corporal e assistidos precisam do seu peso registrado.';
    canvas.replaceWith(aviso);
    return;
  }

  const corLinha = '#4f8cff';
  const corTexto = '#8b949e';
  const corGrade = 'rgba(138, 148, 158, 0.15)';

  grafico = new Chart(canvas, {
    type: 'line',
    data: {
      labels: pontos.map((p) => p.x),
      datasets: [
        {
          label: `${metrica.rotulo} (${metrica.unidade})`,
          data: pontos.map((p) => p.y),
          borderColor: corLinha,
          backgroundColor: 'rgba(79, 140, 255, 0.15)',
          pointBackgroundColor: corLinha,
          pointRadius: 4,
          borderWidth: 2,
          tension: 0.25,
          fill: true,
          // Liga os pontos por cima de uma sessão sem valor, em vez de
          // cortar a linha em dois pedaços soltos.
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { labels: { color: corTexto } },
        tooltip: {
          callbacks: {
            label: (item) => `${metrica.rotulo}: ${num(item.parsed.y, 2)} ${metrica.unidade}`,
          },
        },
      },
      scales: {
        x: { ticks: { color: corTexto }, grid: { color: corGrade } },
        y: {
          ticks: { color: corTexto },
          grid: { color: corGrade },
          // Não força começar em zero: com cargas de 60 a 65, começar em
          // zero achataria a linha e esconderia justamente a progressão.
          beginAtZero: false,
        },
      },
    },
  });
}

/** Variação entre o primeiro e o último ponto do período. */
function cardDeVariacao(dados) {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = 'No período';
  h3.style.margin = '0 0 8px';
  card.appendChild(h3);

  METRICAS.forEach((m) => {
    const v = dados.variacoes[m.id];
    const linha = document.createElement('div');
    linha.className = 'metrica';

    const rotulo = document.createElement('span');
    rotulo.className = 'metrica-rotulo';
    rotulo.textContent = m.rotulo;
    linha.appendChild(rotulo);

    const de = document.createElement('span');
    de.className = 'metrica-valor';
    de.textContent = v.primeiro === null ? '—' : num(v.primeiro, 1);
    linha.appendChild(de);

    const para = document.createElement('span');
    para.className = 'metrica-valor';
    para.textContent = v.ultimo === null ? '—' : num(v.ultimo, 1);
    linha.appendChild(para);

    const dif = document.createElement('span');
    const direcao = v.absoluta === null ? 'igual' : v.absoluta > 0 ? 'melhora' : v.absoluta < 0 ? 'piora' : 'igual';
    dif.className = 'metrica-dif ' + direcao;
    dif.textContent =
      v.absoluta === null
        ? '—'
        : comSinal(v.absoluta, 1) + (v.percentual === null ? '' : ` (${percentual(v.percentual)})`);
    linha.appendChild(dif);

    card.appendChild(linha);
  });

  return card;
}

/** Lista das sessões do período, do mais recente para o mais antigo. */
function tabelaDePontos(dados) {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = `${dados.pontos.length} sessões no período`;
  h3.style.margin = '0 0 8px';
  card.appendChild(h3);

  dados.pontos
    .slice()
    .reverse()
    .forEach((p) => {
      const linha = document.createElement('div');
      linha.className = 'metrica';

      const data = document.createElement('span');
      data.className = 'metrica-rotulo';
      data.textContent = `${formatarCurto(p.data)} · ${p.treinoNome}`;
      linha.appendChild(data);

      const series = document.createElement('span');
      series.className = 'metrica-valor';
      series.textContent = `${p.series}×${p.reps}`;
      linha.appendChild(series);

      const carga = document.createElement('span');
      carga.className = 'metrica-valor';
      carga.textContent = p.cargaMaxima === null ? '—' : num(p.cargaMaxima, 1) + ' kg';
      linha.appendChild(carga);

      const volume = document.createElement('span');
      volume.className = 'metrica-dif';
      volume.textContent = p.volume === null ? '—' : num(p.volume, 0) + ' kg';
      linha.appendChild(volume);

      card.appendChild(linha);
    });

  return card;
}

/* ------------------------------------------------------------------ */
/* Séries por músculo                                                  */
/* ------------------------------------------------------------------ */

async function desenharMusculos() {
  const dados = await progresso.seriesPorMusculo(estado.semana ?? undefined);
  estado.semana = dados.inicio;

  raiz.appendChild(await seletorDeSemana(dados));

  const card = document.createElement('div');
  card.className = 'card';

  const explica = document.createElement('p');
  explica.className = 'texto-fraco pequeno';
  explica.style.margin = '0 0 10px';
  explica.textContent =
    `Planejado = um ciclo completo da rotação (${dados.treinosPorCiclo} treinos), com os opcionais. ` +
    `Realizado = o que você registrou nesta semana (${dados.treinosNaSemana} ${dados.treinosNaSemana === 1 ? 'treino' : 'treinos'}), sem aquecimento.`;
  card.appendChild(explica);

  const cabecalho = document.createElement('div');
  cabecalho.className = 'metrica metrica-cabecalho';
  ['Músculo', 'Plan.', 'Real.', 'Dif.'].forEach((texto, i) => {
    const span = document.createElement('span');
    span.className = i === 0 ? 'metrica-rotulo' : i === 3 ? 'metrica-dif' : 'metrica-valor';
    span.textContent = texto;
    cabecalho.appendChild(span);
  });
  card.appendChild(cabecalho);

  dados.comparacao.forEach((linha) => {
    const div = document.createElement('div');
    div.className = 'metrica';

    const nome = document.createElement('span');
    nome.className = 'metrica-rotulo';
    nome.textContent = linha.nome;
    if (linha.planejado.indiretas > 0) {
      const detalhe = document.createElement('span');
      detalhe.className = 'texto-fraco pequeno';
      detalhe.textContent = ` (${num(linha.planejado.diretas, 2)} dir. + ${num(linha.planejado.indiretas, 2)} ind.)`;
      nome.appendChild(detalhe);
    }
    div.appendChild(nome);

    const plan = document.createElement('span');
    plan.className = 'metrica-valor';
    plan.textContent = num(linha.planejado.total, 2);
    div.appendChild(plan);

    const real = document.createElement('span');
    real.className = 'metrica-valor';
    real.textContent = num(linha.realizado.total, 2);
    div.appendChild(real);

    const dif = document.createElement('span');
    const direcao = linha.diferenca === 0 ? 'igual' : linha.diferenca > 0 ? 'melhora' : 'piora';
    dif.className = 'metrica-dif ' + direcao;
    dif.textContent = comSinal(linha.diferenca, 2);
    div.appendChild(dif);

    card.appendChild(div);
  });

  raiz.appendChild(card);
}

/** Botão para navegar entre as semanas com treino. */
async function seletorDeSemana(dados) {
  const div = document.createElement('div');
  div.style.marginTop = '12px';

  const botao = document.createElement('button');
  botao.className = 'btn btn-bloco';
  const ehAtual = dados.inicio === (await semanaDeHoje());
  botao.textContent =
    (ehAtual ? 'Esta semana' : 'Semana de ' + formatarLongo(dados.inicio)) +
    `  (${formatarCurto(dados.inicio)} a ${formatarCurto(dados.fim)})  ▾`;
  botao.onclick = async () => {
    const semanas = await progresso.semanasComTreino();
    const escolhida = await escolher(
      'Escolher semana',
      semanas.map((s) => ({
        valor: s,
        rotulo: `${formatarCurto(s)} a ${formatarCurto(somarDias(s, 6))}`,
        detalhe: s === dados.inicio ? 'atual' : '',
      }))
    );
    if (!escolhida) return;
    estado.semana = escolhida;
    await desenhar();
  };
  div.appendChild(botao);
  return div;
}

/** O início da semana de hoje, segundo a configuração. */
async function semanaDeHoje() {
  const dados = await progresso.seriesPorMusculo();
  return dados.inicio;
}

/* ------------------------------------------------------------------ */
/* Resumo semanal                                                      */
/* ------------------------------------------------------------------ */

async function desenharSemanas() {
  const lista = await progresso.semanas();

  if (!lista.length) {
    raiz.appendChild(blocoVazio('Nenhuma sessão registrada ainda.'));
    return;
  }

  const card = document.createElement('div');
  card.className = 'card';
  card.style.marginTop = '12px';

  const cabecalho = document.createElement('div');
  cabecalho.className = 'metrica metrica-cabecalho';
  ['Semana', 'Treinos', 'Séries', 'Volume'].forEach((texto, i) => {
    const span = document.createElement('span');
    span.className = i === 0 ? 'metrica-rotulo' : i === 3 ? 'metrica-dif' : 'metrica-valor';
    span.textContent = texto;
    cabecalho.appendChild(span);
  });
  card.appendChild(cabecalho);

  const hoje = hojeIso();
  lista.forEach((s) => {
    const div = document.createElement('div');
    div.className = 'metrica';

    const semana = document.createElement('span');
    semana.className = 'metrica-rotulo';
    semana.textContent = `${formatarCurto(s.semana)} a ${formatarCurto(somarDias(s.semana, 6))}`;
    if (s.semana <= hoje && somarDias(s.semana, 6) >= hoje) {
      const etq = document.createElement('span');
      etq.className = 'texto-fraco pequeno';
      etq.textContent = ' (atual)';
      semana.appendChild(etq);
    }
    div.appendChild(semana);

    const treinos = document.createElement('span');
    treinos.className = 'metrica-valor';
    treinos.textContent = String(s.treinos);
    div.appendChild(treinos);

    const series = document.createElement('span');
    series.className = 'metrica-valor';
    series.textContent = String(s.series);
    div.appendChild(series);

    const volume = document.createElement('span');
    volume.className = 'metrica-dif';
    volume.textContent = s.volume === null ? '—' : num(s.volume, 0) + ' kg';
    div.appendChild(volume);

    card.appendChild(div);
  });

  raiz.appendChild(card);
}
