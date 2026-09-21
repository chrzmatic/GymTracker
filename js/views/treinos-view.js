/**
 * Tela "Treinos": a lista de modelos, separada em rotação e extras.
 *
 * A rotação é uma sequência — a ordem aqui é a ordem que a sugestão do
 * próximo treino vai seguir (Etapa 3). Os extras são uma lista solta, que
 * não afeta a rotação.
 *
 * Daqui também se chega às telas de exercícios e músculos, porque as três
 * coisas são editadas na mesma sessão de trabalho.
 */

import * as treinos from '../services/treino-service.js';
import { seriesPlanejadasDoTreino } from '../domain/treino.js';
import { mapaExercicios } from '../data/exercicios-repo.js';
import { confirmar, escolher, formulario } from '../components/dialogo.js';
import { abrir, recarregar } from '../navegacao.js';

let exercicios = new Map();

/**
 * Renderiza a tela dentro do elemento informado.
 * @param {HTMLElement} raiz
 * @returns {Promise<void>}
 */
export async function montarTreinos(raiz) {
  const [{ rotacao, extras }, mapa] = await Promise.all([
    treinos.listarTreinosAgrupados(),
    mapaExercicios(),
  ]);
  exercicios = mapa;

  raiz.innerHTML = '';
  raiz.appendChild(explicacao());

  secao(raiz, 'Rotação', rotacao, true);
  secao(raiz, 'Extras', extras, false);

  raiz.appendChild(botoesDoRodape());
}

/** Texto curto explicando o que a ordem significa. */
function explicacao() {
  const p = document.createElement('p');
  p.className = 'texto-fraco pequeno';
  p.textContent =
    'A ordem da rotação é a sequência seguida na sugestão do próximo treino. Treinos extras ficam fora dela.';
  return p;
}

/**
 * Desenha uma seção (rotação ou extras).
 * @param {HTMLElement} raiz
 * @param {string} titulo
 * @param {Object[]} lista
 * @param {boolean} naRotacao
 */
function secao(raiz, titulo, lista, naRotacao) {
  const h = document.createElement('h2');
  h.textContent = titulo;
  h.style.margin = '18px 0 8px';
  raiz.appendChild(h);

  if (!lista.length) {
    const vazio = document.createElement('p');
    vazio.className = 'texto-fraco pequeno';
    vazio.textContent = naRotacao
      ? 'Nenhum treino na rotação.'
      : 'Nenhum treino extra.';
    raiz.appendChild(vazio);
    return;
  }

  lista.forEach((treino, i) =>
    raiz.appendChild(cardDeTreino(treino, i + 1, lista.length))
  );
}

/**
 * Card de um treino, com as setas de ordem e o menu de opções.
 * @param {Object} treino
 * @param {number} posicao
 * @param {number} total
 * @returns {HTMLElement}
 */
function cardDeTreino(treino, posicao, total) {
  const card = document.createElement('div');
  card.className = 'card card-clicavel';

  const cab = document.createElement('div');
  cab.className = 'card-cabecalho';

  const marca = document.createElement('span');
  marca.className = 'marca-treino';
  marca.style.background = treino.cor || 'var(--borda)';
  marca.style.marginTop = '7px';
  cab.appendChild(marca);

  const h3 = document.createElement('h3');
  h3.textContent = 'Treino ' + treino.nome;
  cab.appendChild(h3);

  cab.appendChild(seta(treino, -1, posicao > 1));
  cab.appendChild(seta(treino, 1, posicao < total));

  const menu = document.createElement('button');
  menu.className = 'btn btn-icone';
  menu.textContent = '⋯';
  menu.setAttribute('aria-label', 'Opções do treino');
  menu.onclick = (ev) => {
    ev.stopPropagation();
    menuDoTreino(treino);
  };
  cab.appendChild(menu);
  card.appendChild(cab);

  const series = seriesPlanejadasDoTreino(treino);
  const resumo = document.createElement('p');
  resumo.className = 'texto-fraco pequeno';
  resumo.style.margin = '0 0 6px';
  resumo.textContent = treino.itens.length
    ? `${treino.itens.length} exercícios · ${series.obrigatorias} séries` +
      (series.opcionais ? ` (+${series.opcionais} opcionais)` : '')
    : 'Treino vazio — toque para adicionar exercícios.';
  card.appendChild(resumo);

  if (treino.itens.length) {
    const lista = document.createElement('p');
    lista.className = 'texto-fraco pequeno';
    lista.style.margin = '0';
    lista.textContent = treino.itens
      .map((i) => treinos.nomeDoItem(i, exercicios))
      .join(' · ');
    card.appendChild(lista);
  }

  card.onclick = () => abrir('treino-editor', { treinoId: treino.id });
  return card;
}

/**
 * Seta de reordenação dentro do grupo.
 * @param {Object} treino
 * @param {-1|1} direcao
 * @param {boolean} ativo
 * @returns {HTMLElement}
 */
function seta(treino, direcao, ativo) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-icone btn-mover';
  btn.textContent = direcao === -1 ? '↑' : '↓';
  btn.setAttribute('aria-label', direcao === -1 ? 'Subir treino' : 'Descer treino');
  btn.disabled = !ativo;
  btn.onclick = async (ev) => {
    ev.stopPropagation();
    await treinos.moverTreinoNaLista(treino.id, direcao);
    await recarregar();
  };
  return btn;
}

/** Menu de opções de um treino. */
async function menuDoTreino(treino) {
  const acao = await escolher('Treino ' + treino.nome, [
    { valor: 'editar', rotulo: 'Editar exercícios' },
    { valor: 'renomear', rotulo: 'Renomear e mudar a cor' },
    {
      valor: 'rotacao',
      rotulo: treino.naRotacao ? 'Tirar da rotação' : 'Colocar na rotação',
    },
    { valor: 'excluir', rotulo: 'Excluir treino' },
  ]);

  if (acao === 'editar') return abrir('treino-editor', { treinoId: treino.id });

  if (acao === 'renomear') {
    const dados = await formulario('Treino ' + treino.nome, [
      { nome: 'nome', rotulo: 'Nome', valor: treino.nome },
      { nome: 'cor', rotulo: 'Cor no calendário', tipo: 'color', valor: treino.cor || '#4f8cff' },
    ]);
    if (!dados || !dados.nome.trim()) return;
    await treinos.salvar({ ...treino, nome: dados.nome.trim(), cor: dados.cor });
    return recarregar();
  }

  if (acao === 'rotacao') {
    await treinos.alternarNaRotacao(treino.id);
    return recarregar();
  }

  if (acao === 'excluir') {
    const ok = await confirmar(
      'Excluir o treino ' + treino.nome + '?',
      'As sessões já registradas com ele continuam no histórico, intactas. Só o modelo é apagado.'
    );
    if (!ok) return;
    await treinos.excluirTreino(treino.id);
    return recarregar();
  }
}

/** Botões de criar treino e de ir para exercícios e músculos. */
function botoesDoRodape() {
  const div = document.createElement('div');
  div.style.marginTop = '20px';

  const novo = document.createElement('button');
  novo.className = 'btn btn-primario btn-bloco';
  novo.textContent = '+ novo treino';
  novo.onclick = async () => {
    const dados = await formulario(
      'Novo treino',
      [
        { nome: 'nome', rotulo: 'Nome', placeholder: 'D', valor: '' },
        {
          nome: 'naRotacao',
          rotulo: 'Entra na rotação',
          tipo: 'checkbox',
          valor: true,
          dica: 'Desmarque para criar um treino extra, que não afeta a sequência.',
        },
      ],
      'Criar'
    );
    if (!dados || !dados.nome.trim()) return;
    const treino = await treinos.criarTreino(dados.nome, dados.naRotacao);
    await abrir('treino-editor', { treinoId: treino.id });
  };
  div.appendChild(novo);

  const linha = document.createElement('div');
  linha.className = 'linha-botoes';
  linha.style.marginTop = '8px';

  const ex = document.createElement('button');
  ex.className = 'btn';
  ex.textContent = 'Exercícios';
  ex.onclick = () => abrir('exercicios');

  const mus = document.createElement('button');
  mus.className = 'btn';
  mus.textContent = 'Músculos';
  mus.onclick = () => abrir('musculos');

  linha.append(ex, mus);
  div.appendChild(linha);
  return div;
}
