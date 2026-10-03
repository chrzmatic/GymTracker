/** Histórico: todas as sessões, da mais recente para a mais antiga, por mês. */

import * as sessoes from '../services/sessao-service.js';
import { anteriorDoMesmoTreino } from '../services/comparacao-service.js';
import { formatarCurto, partesIso, NOMES_MES, descreverDistancia } from '../utils/date.js';
import { confirmar, escolher } from '../components/dialogo.js';
import { blocoVazio } from '../components/ui.js';
import { abrir, recarregar } from '../navegacao.js';

export async function montarHistorico(raiz) {
  const lista = await sessoes.historico();
  raiz.innerHTML = '';

  if (!lista.length) {
    raiz.replaceChildren(blocoVazio('Nenhuma sessão registrada ainda.'));
    return;
  }

  let mesAtual = null;
  lista.forEach((registro) => {
    const { ano, mes } = partesIso(registro.sessao.data);
    const chave = `${ano}-${mes}`;
    if (chave !== mesAtual) {
      mesAtual = chave;
      const h = document.createElement('h2');
      h.textContent = `${NOMES_MES[mes - 1]} de ${ano}`;
      h.style.margin = '18px 0 8px';
      raiz.appendChild(h);
    }
    raiz.appendChild(cardDaSessao(registro));
  });
}

/**
 * Card de uma sessão.
 * @param {{sessao: Object, series: number, aquecimentos: number, exercicios: number}} registro
 */
function cardDaSessao({ sessao, series, aquecimentos, exercicios }) {
  const card = document.createElement('div');
  card.className = 'card card-clicavel';

  const cab = document.createElement('div');
  cab.className = 'card-cabecalho';

  if (sessao.cor) {
    const marca = document.createElement('span');
    marca.className = 'marca-treino';
    marca.style.background = sessao.cor;
    marca.style.marginTop = '7px';
    cab.appendChild(marca);
  }

  const h3 = document.createElement('h3');
  h3.textContent = 'Treino ' + sessao.treinoNome;
  cab.appendChild(h3);

  if (sessao.status !== sessoes.STATUS.FINALIZADA) {
    const etq = document.createElement('span');
    etq.className = 'etiqueta etiqueta-acento';
    etq.textContent = 'em andamento';
    cab.appendChild(etq);
  }
  if (!sessao.naRotacao) {
    const etq = document.createElement('span');
    etq.className = 'etiqueta';
    etq.textContent = 'extra';
    cab.appendChild(etq);
  }

  const menu = document.createElement('button');
  menu.className = 'btn btn-icone';
  menu.textContent = '⋯';
  menu.setAttribute('aria-label', 'Opções da sessão');
  menu.onclick = (ev) => {
    ev.stopPropagation();
    menuDaSessao(sessao);
  };
  cab.appendChild(menu);
  card.appendChild(cab);

  const detalhe = document.createElement('p');
  detalhe.className = 'texto-fraco pequeno';
  detalhe.style.margin = '0';
  const partes = [
    formatarCurto(sessao.data),
    descreverDistancia(sessao.data),
    `${exercicios} exercícios`,
    `${series} séries`,
  ];
  if (aquecimentos) partes.push(`${aquecimentos} aq`);
  detalhe.textContent = partes.join(' · ');
  card.appendChild(detalhe);

  if (sessao.anotacao) {
    const nota = document.createElement('p');
    nota.className = 'texto-fraco pequeno';
    nota.style.margin = '6px 0 0';
    nota.style.fontStyle = 'italic';
    nota.textContent = sessao.anotacao;
    card.appendChild(nota);
  }

  card.onclick = () => abrirSessao(sessao);
  return card;
}

/** Finalizada abre o resumo; em andamento abre o registro. */
function abrirSessao(sessao) {
  return sessao.status === sessoes.STATUS.FINALIZADA
    ? abrir('sessao-resumo', { sessaoId: sessao.id })
    : abrir('treino', { sessaoId: sessao.id });
}

/** Menu da sessão: ver, editar, comparar com a anterior do mesmo treino e excluir. */
async function menuDaSessao(sessao) {
  const anterior = await anteriorDoMesmoTreino(sessao);

  const opcoes = [
    { valor: 'ver', rotulo: 'Ver resumo' },
    { valor: 'editar', rotulo: 'Editar sessão' },
  ];
  if (anterior) {
    opcoes.push({
      valor: 'comparar',
      rotulo: 'Comparar com a anterior do mesmo treino',
      detalhe: formatarCurto(anterior.data),
    });
  }
  opcoes.push({ valor: 'excluir', rotulo: 'Excluir sessão' });

  const acao = await escolher(
    'Treino ' + sessao.treinoNome + ' · ' + formatarCurto(sessao.data),
    opcoes
  );

  if (acao === 'ver') return abrir('sessao-resumo', { sessaoId: sessao.id });
  if (acao === 'editar') return abrir('treino', { sessaoId: sessao.id });

  if (acao === 'comparar') {
    return abrir('comparar', { idA: anterior.id, idB: sessao.id });
  }

  if (acao === 'excluir') {
    const ok = await confirmar(
      'Excluir a sessão de ' + formatarCurto(sessao.data) + '?',
      'As séries registradas nela serão apagadas.'
    );
    if (!ok) return;
    await sessoes.apagarSessao(sessao.id);
    await recarregar();
  }
}
