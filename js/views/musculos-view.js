/**
 * Tela "Músculos": a lista editável de grupos musculares.
 *
 * É uma lista curta, mas importante: ela é o eixo da tabela de séries
 * semanais da Etapa 5, e a ordem definida aqui é a ordem em que os músculos
 * vão aparecer lá.
 *
 * Excluir um músculo mexe em todos os exercícios que o citam, então a tela
 * mostra antes quantos são.
 */

import * as exercicios from '../services/exercicio-service.js';
import { confirmar, escolher, formulario } from '../components/dialogo.js';
import { blocoVazio } from '../components/ui.js';
import { recarregar } from '../navegacao.js';

/**
 * Renderiza a lista de músculos.
 * @param {HTMLElement} raiz
 * @returns {Promise<void>}
 */
export async function montarMusculos(raiz) {
  const [musculos, todosExercicios] = await Promise.all([
    exercicios.listarMusculos(),
    exercicios.listarExercicios(),
  ]);

  /** Quantos exercícios citam cada músculo, para mostrar na lista. */
  const usos = new Map();
  todosExercicios.forEach((ex) =>
    (ex.musculos ?? []).forEach((m) =>
      usos.set(m.musculoId, (usos.get(m.musculoId) ?? 0) + 1)
    )
  );

  raiz.innerHTML = '';

  const intro = document.createElement('p');
  intro.className = 'texto-fraco pequeno';
  intro.textContent =
    'A ordem daqui é a ordem da tabela de séries semanais. Renomear não desliga os exercícios: o vínculo é por ID.';
  raiz.appendChild(intro);

  if (!musculos.length) {
    raiz.appendChild(blocoVazio('Nenhum músculo cadastrado.'));
  }

  const lista = document.createElement('div');
  lista.className = 'card';
  musculos.forEach((m, i) =>
    lista.appendChild(linha(m, usos.get(m.id) ?? 0, i + 1, musculos.length))
  );
  if (musculos.length) raiz.appendChild(lista);

  const novo = document.createElement('button');
  novo.className = 'btn btn-primario btn-bloco';
  novo.textContent = '+ novo músculo';
  novo.onclick = async () => {
    const dados = await formulario(
      'Novo músculo',
      [{ nome: 'nome', rotulo: 'Nome', placeholder: 'Antebraço' }],
      'Criar'
    );
    if (!dados || !dados.nome.trim()) return;
    await exercicios.criarMusculo(dados.nome);
    await recarregar();
  };
  raiz.appendChild(novo);
}

/**
 * Uma linha da lista de músculos.
 * @param {Object} musculo
 * @param {number} quantosExercicios
 * @param {number} posicao
 * @param {number} total
 * @returns {HTMLElement}
 */
function linha(musculo, quantosExercicios, posicao, total) {
  const div = document.createElement('div');
  div.className = 'linha-musculo linha-lista';

  const nome = document.createElement('span');
  nome.textContent = musculo.nome;
  div.appendChild(nome);

  const uso = document.createElement('span');
  uso.className = 'texto-fraco pequeno';
  uso.textContent = quantosExercicios
    ? `${quantosExercicios} exercício${quantosExercicios > 1 ? 's' : ''}`
    : 'sem uso';
  div.appendChild(uso);

  div.appendChild(seta(musculo, -1, posicao > 1));
  div.appendChild(seta(musculo, 1, posicao < total));

  const menu = document.createElement('button');
  menu.className = 'btn btn-icone';
  menu.textContent = '⋯';
  menu.setAttribute('aria-label', 'Opções do músculo');
  menu.onclick = () => menuDoMusculo(musculo, quantosExercicios);
  div.appendChild(menu);

  return div;
}

/** Seta de reordenação. */
function seta(musculo, direcao, ativo) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-icone btn-mover';
  btn.textContent = direcao === -1 ? '↑' : '↓';
  btn.setAttribute('aria-label', direcao === -1 ? 'Subir músculo' : 'Descer músculo');
  btn.disabled = !ativo;
  btn.onclick = async () => {
    await exercicios.moverMusculo(musculo.id, direcao);
    await recarregar();
  };
  return btn;
}

/** Renomear ou excluir. */
async function menuDoMusculo(musculo, quantosExercicios) {
  const acao = await escolher(musculo.nome, [
    { valor: 'renomear', rotulo: 'Renomear' },
    { valor: 'excluir', rotulo: 'Excluir' },
  ]);

  if (acao === 'renomear') {
    const dados = await formulario('Renomear músculo', [
      { nome: 'nome', rotulo: 'Nome', valor: musculo.nome },
    ]);
    if (!dados || !dados.nome.trim()) return;
    await exercicios.salvarMusculoEditado({ ...musculo, nome: dados.nome });
    return recarregar();
  }

  if (acao === 'excluir') {
    const aviso = quantosExercicios
      ? `Ele vai ser removido de ${quantosExercicios} exercício${quantosExercicios > 1 ? 's' : ''}, que deixam de contar séries para ele.`
      : 'Nenhum exercício usa este músculo.';
    const ok = await confirmar('Excluir ' + musculo.nome + '?', aviso);
    if (!ok) return;
    await exercicios.excluirMusculo(musculo.id);
    return recarregar();
  }
}
