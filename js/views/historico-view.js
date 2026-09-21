/**
 * Tela "Histórico": todas as sessões registradas, da mais recente para a
 * mais antiga, agrupadas por mês.
 *
 * Daqui se abre qualquer sessão passada para editar ou excluir — o que a
 * especificação pede na seção 6.2. A tela da sessão é a mesma do registro
 * do dia, então editar o passado usa exatamente os mesmos controles.
 */

import * as sessoes from '../services/sessao-service.js';
import { anteriorDoMesmoTreino } from '../services/comparacao-service.js';
import { formatarCurto, partesIso, NOMES_MES, descreverDistancia } from '../utils/date.js';
import { confirmar, escolher } from '../components/dialogo.js';
import { abrir, recarregar } from '../navegacao.js';

/**
 * Renderiza o histórico.
 * @param {HTMLElement} raiz
 * @returns {Promise<void>}
 */
export async function montarHistorico(raiz) {
  const lista = await sessoes.historico();
  raiz.innerHTML = '';

  if (!lista.length) {
    raiz.innerHTML = '<div class="vazio">Nenhuma sessão registrada ainda.</div>';
    return;
  }

  const resumo = document.createElement('p');
  resumo.className = 'texto-fraco pequeno';
  resumo.textContent = `${lista.length} sessão${lista.length > 1 ? 'ões' : ''} registrada${lista.length > 1 ? 's' : ''}. Toque numa para abrir, editar ou excluir.`;
  raiz.appendChild(resumo);

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
 * Card de uma sessão no histórico.
 * @param {{sessao: Object, series: number, aquecimentos: number, exercicios: number}} registro
 * @returns {HTMLElement}
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

  card.onclick = () => abrir('treino', { sessaoId: sessao.id });
  return card;
}

/**
 * Menu de uma sessão do histórico.
 *
 * O atalho "comparar com a anterior do mesmo treino" é o que a
 * especificação pede na seção 6.5 — é a comparação que interessa na
 * prática, e achá-la na mão na lista de sessões seria trabalhoso.
 *
 * @param {Object} sessao
 */
async function menuDaSessao(sessao) {
  const anterior = await anteriorDoMesmoTreino(sessao);

  const opcoes = [{ valor: 'abrir', rotulo: 'Abrir sessão' }];
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

  if (acao === 'abrir') return abrir('treino', { sessaoId: sessao.id });

  if (acao === 'comparar') {
    return abrir('comparar', { idA: anterior.id, idB: sessao.id });
  }

  if (acao === 'excluir') {
    const ok = await confirmar(
      'Excluir a sessão de ' + formatarCurto(sessao.data) + '?',
      'As séries registradas nela serão apagadas. Tudo que depende de datas (sugestão do próximo treino, gráficos, séries semanais) recalcula sozinho.'
    );
    if (!ok) return;
    await sessoes.apagarSessao(sessao.id);
    await recarregar();
  }
}
