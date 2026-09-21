/**
 * Aba Calendário: visão mensal dos treinos.
 *
 * Cada dia treinado ganha uma bolinha na cor do treino (mais de uma se
 * houve mais de uma sessão no dia). Tocar num dia:
 *  - com treino: abre a sessão daquele dia;
 *  - sem treino, passado ou hoje: mostra o sugerido e deixa registrar;
 *  - futuro: mostra o que seria sugerido, considerando só o que já foi
 *    registrado, e não deixa registrar (não dá para treinar amanhã hoje).
 */

import * as rotacao from '../services/rotacao-service.js';
import * as sessoes from '../services/sessao-service.js';
import {
  hojeIso,
  formatarLongo,
  partesIso,
  NOMES_MES,
  descreverDistancia,
} from '../utils/date.js';
import { rotulosDaSemana, mesVizinho, acoesDoDia } from '../domain/calendario.js';
import { escolher } from '../components/dialogo.js';
import { abrir } from '../navegacao.js';

/** Mês visível. Guardado entre montagens para a tela voltar onde estava. */
const estado = { ano: null, mes: null };

let raiz = null;
let dados = null;

/**
 * Renderiza a aba Calendário.
 * @param {HTMLElement} elemento
 * @param {{ano?: number, mes?: number}} [params]
 * @returns {Promise<void>}
 */
export async function montarCalendario(elemento, params = {}) {
  raiz = elemento;
  const hoje = partesIso(hojeIso());
  if (params.ano) estado.ano = params.ano;
  if (params.mes) estado.mes = params.mes;
  if (!estado.ano) {
    estado.ano = hoje.ano;
    estado.mes = hoje.mes;
  }
  await desenhar();
}

/** Relê o mês e redesenha. */
async function desenhar() {
  dados = await rotacao.dadosDoMes(estado.ano, estado.mes);
  raiz.innerHTML = '';
  raiz.appendChild(barraDoMes());
  raiz.appendChild(grade());
  raiz.appendChild(resumo());
}

/* ------------------------------------------------------------------ */
/* Cabeçalho do mês                                                    */
/* ------------------------------------------------------------------ */

function barraDoMes() {
  const div = document.createElement('div');
  div.className = 'barra-mes';

  const anterior = document.createElement('button');
  anterior.className = 'btn btn-icone';
  anterior.textContent = '‹';
  anterior.setAttribute('aria-label', 'Mês anterior');
  anterior.onclick = () => irParaMes(-1);

  const titulo = document.createElement('button');
  titulo.className = 'btn btn-mes-titulo';
  titulo.textContent = `${NOMES_MES[estado.mes - 1]} de ${estado.ano}`;
  titulo.title = 'Voltar para o mês de hoje';
  titulo.onclick = async () => {
    const hoje = partesIso(hojeIso());
    estado.ano = hoje.ano;
    estado.mes = hoje.mes;
    await desenhar();
  };

  const proximo = document.createElement('button');
  proximo.className = 'btn btn-icone';
  proximo.textContent = '›';
  proximo.setAttribute('aria-label', 'Próximo mês');
  proximo.onclick = () => irParaMes(1);

  div.append(anterior, titulo, proximo);
  return div;
}

/** Avança ou volta um mês. */
async function irParaMes(direcao) {
  const { ano, mes } = mesVizinho(estado.ano, estado.mes, direcao);
  estado.ano = ano;
  estado.mes = mes;
  await desenhar();
}

/* ------------------------------------------------------------------ */
/* Grade                                                               */
/* ------------------------------------------------------------------ */

function grade() {
  const tabela = document.createElement('div');
  tabela.className = 'calendario';

  rotulosDaSemana(dados.config.inicioSemana).forEach((rotulo) => {
    const c = document.createElement('div');
    c.className = 'calendario-rotulo';
    c.textContent = rotulo;
    tabela.appendChild(c);
  });

  const hoje = hojeIso();
  dados.grade.semanas.flat().forEach((celula) => {
    tabela.appendChild(diaDaGrade(celula, hoje));
  });

  return tabela;
}

/**
 * Uma célula de dia.
 * @param {{iso: string, dia: number, doMes: boolean}} celula
 * @param {string} hoje
 * @returns {HTMLElement}
 */
function diaDaGrade(celula, hoje) {
  const doDia = dados.porData.get(celula.iso) ?? [];

  const btn = document.createElement('button');
  btn.className = 'calendario-dia';
  if (!celula.doMes) btn.classList.add('fora-do-mes');
  if (celula.iso === hoje) btn.classList.add('hoje');
  if (celula.iso > hoje) btn.classList.add('futuro');
  if (doDia.length) btn.classList.add('com-treino');

  const numero = document.createElement('span');
  numero.className = 'calendario-numero';
  numero.textContent = celula.dia;
  btn.appendChild(numero);

  const marcas = document.createElement('span');
  marcas.className = 'calendario-marcas';
  doDia.slice(0, 3).forEach((s) => {
    const ponto = document.createElement('span');
    ponto.className = 'marca-treino';
    ponto.style.background = s.cor || 'var(--texto-fraco)';
    if (s.status !== sessoes.STATUS.FINALIZADA) ponto.classList.add('marca-aberta');
    marcas.appendChild(ponto);
  });
  btn.appendChild(marcas);

  btn.setAttribute(
    'aria-label',
    formatarLongo(celula.iso) + (doDia.length ? `: ${doDia.map((s) => s.treinoNome).join(', ')}` : '')
  );
  btn.onclick = () => tocarNoDia(celula.iso, doDia);
  return btn;
}

/**
 * O que acontece ao tocar num dia.
 *
 * Um dia que já tem treino abre um menu com as sessões dele **e** a opção
 * de registrar mais uma: mais de uma sessão no mesmo dia é permitida, e
 * antes dava para criar só nos dias vazios, o que era incoerente.
 *
 * @param {string} dia AAAA-MM-DD
 * @param {Object[]} doDia sessões daquele dia
 */
async function tocarNoDia(dia, doDia) {
  const acoes = acoesDoDia(dia, doDia, hojeIso());
  const titulo = `${formatarLongo(dia)} · ${descreverDistancia(dia)}`;

  const opcoes = doDia.map((s) => ({
    valor: 'abrir:' + s.id,
    rotulo: 'Abrir treino ' + s.treinoNome,
    detalhe: s.status === sessoes.STATUS.FINALIZADA ? '' : 'em andamento',
  }));

  if (acoes.podeRegistrar) {
    opcoes.push({
      valor: 'registrar',
      rotulo: doDia.length ? 'Registrar outro treino neste dia' : 'Registrar um treino',
    });
  }

  if (!opcoes.length) {
    // Dia futuro e vazio: só dá para informar qual seria o sugerido.
    await mostrarSugestaoFutura(dia, titulo);
    return;
  }

  const escolha = opcoes.length === 1 ? opcoes[0].valor : await escolher(titulo, opcoes);
  if (!escolha) return;

  if (escolha.startsWith('abrir:')) {
    await abrir('treino', { sessaoId: escolha.slice(6) });
    return;
  }
  await registrarNoDia(dia, titulo);
}

/**
 * Dia futuro e vazio: informa o sugerido sem deixar registrar.
 * @param {string} dia
 * @param {string} titulo
 */
async function mostrarSugestaoFutura(dia, titulo) {
  const sugestao = dados.sugestaoDoDia(dia);
  const { avisar } = await import('../components/dialogo.js');
  await avisar(
    titulo,
    sugestao
      ? `Sugerido para este dia: treino ${sugestao.treino.nome}. ${sugestao.explicacao} A sugestão considera só os treinos já registrados, então pode mudar até lá.`
      : 'Nenhum treino na rotação ainda.'
  );
}

/**
 * Escolhe o treino e registra a sessão naquele dia, com o sugerido no topo.
 * @param {string} dia
 * @param {string} titulo
 */
async function registrarNoDia(dia, titulo) {
  const sugestao = dados.sugestaoDoDia(dia);

  const opcoes = [];
  if (sugestao) {
    opcoes.push({
      valor: sugestao.treino.id,
      rotulo: 'Treino ' + sugestao.treino.nome,
      detalhe: 'sugerido',
    });
  }
  dados.treinos
    .filter((t) => !sugestao || t.id !== sugestao.treino.id)
    .forEach((t) =>
      opcoes.push({
        valor: t.id,
        rotulo: 'Treino ' + t.nome,
        detalhe: t.naRotacao ? '' : 'extra',
      })
    );

  if (!opcoes.length) {
    const { avisar } = await import('../components/dialogo.js');
    await avisar(titulo, 'Nenhum treino cadastrado.');
    return;
  }

  const treinoId = await escolher('Registrar em ' + titulo, opcoes);
  if (!treinoId) return;

  const sessao = await sessoes.iniciarSessao(treinoId, dia);
  await abrir('treino', { sessaoId: sessao.id });
}

/* ------------------------------------------------------------------ */
/* Resumo do mês                                                       */
/* ------------------------------------------------------------------ */

function resumo() {
  const div = document.createElement('div');
  div.className = 'card';
  div.style.marginTop = '16px';

  const h3 = document.createElement('h3');
  h3.textContent =
    dados.resumo.total === 1 ? '1 treino no mês' : `${dados.resumo.total} treinos no mês`;
  h3.style.margin = '0 0 8px';
  div.appendChild(h3);

  if (!dados.resumo.total) {
    const p = document.createElement('p');
    p.className = 'texto-fraco pequeno';
    p.style.margin = '0';
    p.textContent = 'Toque num dia para registrar um treino nele.';
    div.appendChild(p);
    return div;
  }

  const legenda = document.createElement('div');
  legenda.className = 'legenda';
  dados.resumo.porTreino.forEach((t) => {
    const item = document.createElement('span');
    item.className = 'legenda-item';
    const ponto = document.createElement('span');
    ponto.className = 'marca-treino';
    ponto.style.background = t.cor || 'var(--texto-fraco)';
    const texto = document.createElement('span');
    texto.textContent = `${t.nome} · ${t.quantas}`;
    item.append(ponto, texto);
    legenda.appendChild(item);
  });
  div.appendChild(legenda);

  return div;
}
