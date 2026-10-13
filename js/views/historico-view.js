/**
 * Histórico: todas as sessões, da mais recente para a mais antiga, por mês.
 * Dá para escolher várias e copiar o texto delas juntas.
 */

import * as sessoes from '../services/sessao-service.js';
import { anteriorDoMesmoTreino } from '../services/comparacao-service.js';
import {
  resumirSessao,
  textoDeVariasSessoes,
  textoParaCopiar,
} from '../domain/resumo-sessao.js';
import {
  descreverDistancia,
  formatarCurto,
  NOMES_MES,
  partesIso,
} from '../utils/date.js';
import { copiarOuMostrar } from '../components/copiar.js';
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

  const area = document.createElement('div');
  area.className = 'historico';
  const selecao = criarSelecao(area);

  let mesAtual = null;
  lista.forEach((registro) => {
    const { ano, mes } = partesIso(registro.sessao.data);
    const chave = `${ano}-${mes}`;
    if (chave !== mesAtual) {
      mesAtual = chave;
      const h = document.createElement('h2');
      h.textContent = `${NOMES_MES[mes - 1]} de ${ano}`;
      h.classList.add('titulo-secao');
      area.appendChild(h);
    }
    area.appendChild(cardDaSessao(registro, selecao));
  });

  area.appendChild(selecao.barra);
  raiz.appendChild(area);
}

/**
 * Escolha de várias sessões para copiar.
 * Cada sessão é lida do banco ao ser marcada, para o texto já estar pronto no
 * toque de copiar (o iPhone só copia dentro do toque).
 * @param {HTMLElement} area recebe a classe `selecionando` enquanto escolhe
 */
function criarSelecao(area) {
  /** id da sessão → sessão carregada, ou null enquanto carrega. */
  const escolhidas = new Map();
  /** id da sessão → card dela. */
  const cards = new Map();
  let ativa = false;

  const barra = document.createElement('div');
  barra.className = 'barra-selecao oculto';

  const total = document.createElement('span');
  total.className = 'barra-selecao-total texto-fraco pequeno';

  const cancelar = document.createElement('button');
  cancelar.className = 'btn btn-pequeno';
  cancelar.dataset.acao = 'cancelar-selecao';
  cancelar.textContent = 'Cancelar';
  cancelar.onclick = () => sair();

  const copiar = document.createElement('button');
  copiar.className = 'btn btn-primario btn-pequeno';
  copiar.dataset.acao = 'copiar-selecao';
  copiar.textContent = 'Copiar texto';
  copiar.onclick = async () => {
    const carregadas = [...escolhidas.values()];
    if (!carregadas.length || carregadas.includes(null)) return;
    if (!(await copiarOuMostrar(textoDeVariasSessoes(carregadas)))) return;
    copiar.textContent = 'Copiado ✓';
    setTimeout(() => {
      copiar.textContent = 'Copiar texto';
    }, 2000);
  };

  barra.append(total, cancelar, copiar);

  /** Barra, cards e botão de copiar refletem a escolha atual. */
  const atualizar = () => {
    area.classList.toggle('selecionando', ativa);
    barra.classList.toggle('oculto', !ativa);
    const n = escolhidas.size;
    total.textContent = `${n} ${n === 1 ? 'selecionada' : 'selecionadas'}`;
    copiar.disabled = !n || [...escolhidas.values()].includes(null);
    cards.forEach(({ card, menu }, id) => {
      const marcada = escolhidas.has(id);
      card.classList.toggle('selecionada', marcada);
      menu.textContent = ativa ? (marcada ? '✓' : '') : '⋯';
      menu.setAttribute('aria-label', ativa ? 'Selecionar sessão' : 'Opções da sessão');
      if (ativa) menu.setAttribute('aria-pressed', String(marcada));
      else menu.removeAttribute('aria-pressed');
    });
  };

  const alternar = async (sessaoId) => {
    if (escolhidas.has(sessaoId)) {
      escolhidas.delete(sessaoId);
      atualizar();
      return;
    }
    escolhidas.set(sessaoId, null);
    atualizar();
    const carregada = await sessoes.carregarSessao(sessaoId);
    // Desmarcada enquanto carregava: não volta.
    if (!escolhidas.has(sessaoId)) return;
    // Excluída por fora: sai da escolha.
    if (carregada) escolhidas.set(sessaoId, carregada);
    else escolhidas.delete(sessaoId);
    atualizar();
  };

  const sair = () => {
    ativa = false;
    escolhidas.clear();
    atualizar();
  };

  return {
    barra,
    get ativa() {
      return ativa;
    },
    registrar(sessaoId, card, menu) {
      cards.set(sessaoId, { card, menu });
    },
    /** Começa a escolher, já com esta sessão marcada. */
    entrar(sessaoId) {
      ativa = true;
      return alternar(sessaoId);
    },
    alternar,
  };
}

/**
 * Card de uma sessão.
 * @param {{sessao: Object, series: number, aquecimentos: number, exercicios: number}} registro
 * @param {ReturnType<typeof criarSelecao>} selecao
 */
function cardDaSessao({ sessao, series, aquecimentos, exercicios }, selecao) {
  const card = document.createElement('div');
  card.className = 'card card-clicavel';
  card.dataset.sessaoId = sessao.id;

  const cab = document.createElement('div');
  cab.className = 'card-cabecalho';

  if (sessao.cor) {
    const marca = document.createElement('span');
    marca.className = 'marca-treino';
    marca.style.background = sessao.cor;
    marca.classList.add('marca-alinhada');
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

  // Fora da escolha abre o menu; durante a escolha, marca e desmarca.
  const menu = document.createElement('button');
  menu.className = 'btn btn-icone btn-menu-sessao';
  menu.textContent = '⋯';
  menu.setAttribute('aria-label', 'Opções da sessão');
  menu.onclick = (ev) => {
    ev.stopPropagation();
    if (selecao.ativa) selecao.alternar(sessao.id);
    else menuDaSessao(sessao, menu, selecao);
  };
  cab.appendChild(menu);
  card.appendChild(cab);
  selecao.registrar(sessao.id, card, menu);

  const detalhe = document.createElement('p');
  detalhe.className = 'texto-fraco pequeno m-0';
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
    nota.className = 'texto-fraco pequeno m-0 mt-2';
    nota.classList.add('texto-italico');
    nota.textContent = sessao.anotacao;
    card.appendChild(nota);
  }

  card.onclick = () => {
    if (selecao.ativa) selecao.alternar(sessao.id);
    else abrirSessao(sessao);
  };
  return card;
}

/** Finalizada abre o resumo; em andamento abre o registro. */
function abrirSessao(sessao) {
  return sessao.status === sessoes.STATUS.FINALIZADA
    ? abrir('sessao-resumo', { sessaoId: sessao.id })
    : abrir('treino', { sessaoId: sessao.id });
}

/**
 * Menu da sessão: ver, editar, copiar, escolher várias, comparar com a anterior
 * do mesmo treino e excluir.
 * @param {HTMLButtonElement} botao o "⋯", que confirma quando copia
 */
async function menuDaSessao(sessao, botao, selecao) {
  // O texto fica pronto antes do menu abrir, para copiar dentro do toque.
  const [anterior, carregada] = await Promise.all([
    anteriorDoMesmoTreino(sessao),
    sessoes.carregarSessao(sessao.id),
  ]);

  const opcoes = [
    { valor: 'ver', rotulo: 'Ver resumo' },
    { valor: 'editar', rotulo: 'Editar sessão' },
  ];
  let copiando = null;
  if (carregada) {
    const texto = textoParaCopiar(resumirSessao(carregada));
    opcoes.push({
      valor: 'copiar',
      rotulo: 'Copiar texto',
      aoTocar: () => {
        copiando = copiarOuMostrar(texto);
      },
    });
  }
  opcoes.push({ valor: 'selecionar', rotulo: 'Selecionar várias para copiar' });
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
    opcoes,
  );

  if (acao === 'ver') return abrir('sessao-resumo', { sessaoId: sessao.id });
  if (acao === 'editar') return abrir('treino', { sessaoId: sessao.id });

  if (acao === 'copiar') {
    if (!(await copiando)) return;
    botao.textContent = '✓';
    setTimeout(() => {
      // Só volta se nada mudou o botão nesse meio tempo.
      if (botao.textContent === '✓' && !selecao.ativa) botao.textContent = '⋯';
    }, 2000);
    return;
  }

  if (acao === 'selecionar') return selecao.entrar(sessao.id);

  if (acao === 'comparar') {
    return abrir('comparar', { idA: anterior.id, idB: sessao.id });
  }

  if (acao === 'excluir') {
    const ok = await confirmar(
      'Excluir a sessão de ' + formatarCurto(sessao.data) + '?',
      'As séries registradas nela serão apagadas.',
    );
    if (!ok) return;
    await sessoes.apagarSessao(sessao.id);
    await recarregar();
  }
}
