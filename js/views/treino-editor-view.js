/**
 * Tela de edição de um treino: a lista ordenada de itens.
 *
 * Um item é um exercício ou um grupo de alternativas ("Voador inverso ou
 * face pull"). Aqui se define a ordem, as séries e reps planejadas, o que é
 * opcional e quais são as alternativas.
 *
 * Nada do que se faz aqui altera sessões já registradas: a sessão guarda
 * uma cópia congelada do modelo do dia em que foi feita.
 */

import * as treinos from '../services/treino-service.js';
import { listarExercicios } from '../data/exercicios-repo.js';
import { seriesPlanejadasDoTreino } from '../domain/treino.js';
import { paraNumero } from '../utils/format.js';
import { confirmar, escolher, escolherComBusca, formulario } from '../components/dialogo.js';
import { definirTitulo, abrir, voltarUmaTela } from '../navegacao.js';

const estado = {
  treinoId: null,
  treino: null,
  exercicios: new Map(),
};

let raiz = null;

/**
 * Renderiza o editor de um treino.
 * @param {HTMLElement} elemento
 * @param {{treinoId: string}} params
 * @returns {Promise<void>}
 */
export async function montarEditor(elemento, params) {
  raiz = elemento;
  estado.treinoId = params.treinoId;
  await desenhar();
}

/** Relê o treino do banco e redesenha. */
async function desenhar() {
  const detalhe = await treinos.buscarTreinoDetalhado(estado.treinoId);
  if (!detalhe) {
    await voltarUmaTela();
    return;
  }
  estado.treino = detalhe.treino;
  estado.exercicios = detalhe.exercicios;
  definirTitulo('Treino ' + estado.treino.nome);

  raiz.innerHTML = '';
  raiz.appendChild(resumoDoTreino());

  if (!estado.treino.itens.length) {
    const vazio = document.createElement('div');
    vazio.className = 'vazio';
    vazio.textContent = 'Nenhum exercício ainda.';
    raiz.appendChild(vazio);
  }

  estado.treino.itens.forEach((item, i) =>
    raiz.appendChild(cardDeItem(item, i + 1, estado.treino.itens.length))
  );

  raiz.appendChild(botaoAdicionar());
}

/** Linha de resumo: quantos exercícios e quantas séries por sessão. */
function resumoDoTreino() {
  const s = seriesPlanejadasDoTreino(estado.treino);
  const p = document.createElement('p');
  p.className = 'texto-fraco pequeno';
  p.textContent =
    `${estado.treino.itens.length} exercícios · ${s.obrigatorias} séries por sessão` +
    (s.opcionais ? ` (+${s.opcionais} se fizer os opcionais)` : '');
  return p;
}

/**
 * Card de um item do treino.
 * @param {Object} item
 * @param {number} posicao
 * @param {number} total
 * @returns {HTMLElement}
 */
function cardDeItem(item, posicao, total) {
  const card = document.createElement('div');
  card.className = 'card';

  const cab = document.createElement('div');
  cab.className = 'card-cabecalho';

  const ordem = document.createElement('span');
  ordem.className = 'ordem-item';
  ordem.textContent = posicao + 'º';
  cab.appendChild(ordem);

  const h3 = document.createElement('h3');
  h3.textContent = treinos.nomeDoItem(item, estado.exercicios);
  cab.appendChild(h3);

  if (item.opcional) {
    const etq = document.createElement('span');
    etq.className = 'etiqueta etiqueta-opcional';
    etq.textContent = 'opcional';
    cab.appendChild(etq);
  }

  cab.appendChild(seta(item, -1, posicao > 1));
  cab.appendChild(seta(item, 1, posicao < total));

  const menu = document.createElement('button');
  menu.className = 'btn btn-icone';
  menu.textContent = '⋯';
  menu.setAttribute('aria-label', 'Opções do exercício');
  menu.onclick = () => menuDoItem(item);
  cab.appendChild(menu);
  card.appendChild(cab);

  if (item.tipo === 'alternativas') card.appendChild(listaDeAlternativas(item));

  card.appendChild(linhaDePlanejamento(item));
  return card;
}

/** Seta de reordenação. */
function seta(item, direcao, ativo) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-icone btn-mover';
  btn.textContent = direcao === -1 ? '↑' : '↓';
  btn.setAttribute('aria-label', direcao === -1 ? 'Subir exercício' : 'Descer exercício');
  btn.disabled = !ativo;
  btn.onclick = async () => {
    estado.treino = await treinos.moverItem(estado.treino, item.id, direcao);
    await desenhar();
  };
  return btn;
}

/**
 * Pílulas das alternativas. A marcada é a padrão, que a sessão nova começa
 * usando; tocar em outra troca o padrão.
 */
function listaDeAlternativas(item) {
  const div = document.createElement('div');
  div.className = 'pilulas';
  item.alternativas.forEach((id) => {
    const btn = document.createElement('button');
    btn.className = 'pilula';
    btn.textContent = estado.exercicios.get(id)?.nome ?? 'Exercício removido';
    btn.setAttribute('aria-pressed', String(id === item.exercicioPadraoId));
    btn.title = 'Definir como alternativa padrão';
    btn.onclick = async () => {
      if (id === item.exercicioPadraoId) return;
      estado.treino = await treinos.alterarItem(estado.treino, item.id, {
        exercicioPadraoId: id,
      });
      await desenhar();
    };
    div.appendChild(btn);
  });
  return div;
}

/** Botões de séries e reps planejadas, editáveis com um toque. */
function linhaDePlanejamento(item) {
  const div = document.createElement('div');
  div.className = 'linha-botoes';

  const series = document.createElement('button');
  series.className = 'btn btn-pequeno';
  series.textContent = `${item.seriesPlanejadas ?? 3} séries`;
  series.onclick = () => editarPlanejamento(item);

  const reps = document.createElement('button');
  reps.className = 'btn btn-pequeno';
  reps.textContent =
    item.repsPlanejadas === null || item.repsPlanejadas === undefined
      ? 'reps: livre'
      : `${item.repsPlanejadas} reps`;
  reps.onclick = () => editarPlanejamento(item);

  div.append(series, reps);
  return div;
}

/** Formulário de séries, reps e opcional. */
async function editarPlanejamento(item) {
  const dados = await formulario(treinos.nomeDoItem(item, estado.exercicios), [
    {
      nome: 'series',
      rotulo: 'Séries planejadas',
      tipo: 'number',
      valor: item.seriesPlanejadas ?? 3,
    },
    {
      nome: 'reps',
      rotulo: 'Reps planejadas',
      tipo: 'number',
      valor: item.repsPlanejadas ?? '',
      dica: 'Deixe em branco para não sugerir reps. Só vale na primeira vez do exercício; depois o app usa o seu histórico.',
    },
    {
      nome: 'opcional',
      rotulo: 'Exercício opcional',
      tipo: 'checkbox',
      valor: Boolean(item.opcional),
      dica: 'Aparece marcado no treino e pode ser pulado sem aviso.',
    },
  ]);
  if (!dados) return;

  const series = paraNumero(dados.series);
  estado.treino = await treinos.alterarItem(estado.treino, item.id, {
    seriesPlanejadas: series && series > 0 ? Math.round(series) : 1,
    repsPlanejadas: paraNumero(dados.reps),
    opcional: dados.opcional,
  });
  await desenhar();
}

/** Menu de opções do item. */
async function menuDoItem(item) {
  const nome = treinos.nomeDoItem(item, estado.exercicios);
  const opcoes = [{ valor: 'planejar', rotulo: 'Séries, reps e opcional' }];

  if (item.tipo === 'alternativas') {
    opcoes.push(
      { valor: 'nome-grupo', rotulo: 'Renomear o grupo' },
      { valor: 'add-alt', rotulo: 'Adicionar alternativa' },
      { valor: 'tirar-alt', rotulo: 'Remover uma alternativa' },
      { valor: 'desfazer', rotulo: 'Desfazer o grupo' }
    );
  } else {
    opcoes.push(
      { valor: 'trocar', rotulo: 'Trocar por outro exercício' },
      { valor: 'virar-grupo', rotulo: 'Transformar em grupo de alternativas' },
      { valor: 'editar-ex', rotulo: 'Editar o exercício em si' }
    );
  }
  opcoes.push({ valor: 'remover', rotulo: 'Remover do treino' });

  const acao = await escolher(nome, opcoes);
  if (!acao) return;

  if (acao === 'planejar') return editarPlanejamento(item);

  if (acao === 'editar-ex') {
    return abrir('exercicio-editor', { exercicioId: item.exercicioId });
  }

  if (acao === 'trocar') {
    const id = await escolherExercicio('Trocar por', [item.exercicioId]);
    if (!id) return;
    estado.treino = await treinos.alterarItem(estado.treino, item.id, { exercicioId: id });
    return desenhar();
  }

  if (acao === 'virar-grupo') {
    const id = await escolherExercicio('Alternativa ao ' + nome, [item.exercicioId]);
    if (!id) return;
    const outro = estado.exercicios.get(id)?.nome ?? '';
    estado.treino = await treinos.criarGrupo(
      estado.treino,
      item.id,
      id,
      `${nome} ou ${outro}`
    );
    return desenhar();
  }

  if (acao === 'nome-grupo') {
    const dados = await formulario('Nome do grupo', [
      {
        nome: 'nome',
        rotulo: 'Nome',
        valor: item.nome ?? '',
        dica: 'Em branco, o app monta o nome juntando as alternativas.',
      },
    ]);
    if (!dados) return;
    estado.treino = await treinos.alterarItem(estado.treino, item.id, {
      nome: dados.nome.trim() || null,
    });
    return desenhar();
  }

  if (acao === 'add-alt') {
    const id = await escolherExercicio('Adicionar alternativa', item.alternativas);
    if (!id) return;
    estado.treino = await treinos.adicionarAlternativa(estado.treino, item.id, id);
    return desenhar();
  }

  if (acao === 'tirar-alt') {
    const id = await escolher(
      'Remover qual alternativa?',
      item.alternativas.map((a) => ({
        valor: a,
        rotulo: estado.exercicios.get(a)?.nome ?? a,
      }))
    );
    if (!id) return;
    estado.treino = await treinos.tirarAlternativa(estado.treino, item.id, id);
    return desenhar();
  }

  if (acao === 'desfazer') {
    const padrao = estado.exercicios.get(item.exercicioPadraoId)?.nome ?? 'a alternativa padrão';
    const ok = await confirmar(
      'Desfazer o grupo?',
      `O item passa a ser só ${padrao}. As sessões já registradas não mudam.`,
      'Desfazer'
    );
    if (!ok) return;
    estado.treino = await treinos.desfazerGrupoDeAlternativas(estado.treino, item.id);
    return desenhar();
  }

  if (acao === 'remover') {
    const ok = await confirmar(
      'Remover do treino?',
      `${nome} sai deste treino. O exercício continua cadastrado e o histórico não muda.`,
      'Remover'
    );
    if (!ok) return;
    estado.treino = await treinos.removerItem(estado.treino, item.id);
    return desenhar();
  }
}

/**
 * Abre a busca de exercícios, escondendo os que já estão no item.
 * @param {string} titulo
 * @param {string[]} [excluir] ids a não mostrar
 * @returns {Promise<string|null>}
 */
async function escolherExercicio(titulo, excluir = []) {
  const todos = await listarExercicios();
  const opcoes = todos
    .filter((e) => !excluir.includes(e.id))
    .map((e) => ({ valor: e.id, rotulo: e.nome }));
  if (!opcoes.length) return null;
  return escolherComBusca(titulo, opcoes);
}

/** Botão de adicionar exercício ao treino. */
function botaoAdicionar() {
  const div = document.createElement('div');
  div.style.marginTop = '12px';

  const add = document.createElement('button');
  add.className = 'btn btn-primario btn-bloco';
  add.textContent = '+ exercício';
  add.onclick = async () => {
    const id = await escolherExercicio('Adicionar exercício');
    if (!id) return;
    estado.treino = await treinos.adicionarItem(estado.treino, id);
    await desenhar();
  };
  div.appendChild(add);

  const novo = document.createElement('button');
  novo.className = 'btn btn-bloco';
  novo.style.marginTop = '8px';
  novo.textContent = 'Criar um exercício novo';
  novo.onclick = () => abrir('exercicio-editor', { novo: true, treinoId: estado.treinoId });
  div.appendChild(novo);

  return div;
}
