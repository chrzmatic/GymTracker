/**
 * Tela de peso corporal: registrar e ver o histórico.
 *
 * Chegou antes da hora (a especificação a coloca na Etapa 5) porque a
 * comparação da Etapa 4 depende dela: sem peso registrado, exercícios de
 * peso corporal e assistidos não têm carga efetiva e só dá para comparar
 * reps e a assistência.
 */

import * as peso from '../services/peso-service.js';
import { hojeIso, formatarLongo, descreverDistancia } from '../utils/date.js';
import { num, paraNumero, comSinal } from '../utils/format.js';
import { confirmar, escolher, formulario } from '../components/dialogo.js';
import { blocoVazio } from '../components/ui.js';
import { recarregar } from '../navegacao.js';

/**
 * Renderiza a tela de peso corporal.
 * @param {HTMLElement} raiz
 * @returns {Promise<void>}
 */
export async function montarPeso(raiz) {
  const [lista, resumo] = await Promise.all([peso.listarPesos(), peso.resumo()]);
  raiz.innerHTML = '';

  const explica = document.createElement('p');
  explica.className = 'texto-fraco pequeno';
  explica.textContent =
    'Usado para calcular a carga efetiva de barra fixa, paralelas e exercícios assistidos. Vale sempre o peso mais recente até a data da sessão.';
  raiz.appendChild(explica);

  const registrar = document.createElement('button');
  registrar.className = 'btn btn-primario btn-bloco';
  registrar.textContent = '+ registrar peso';
  registrar.onclick = () => abrirFormulario();
  raiz.appendChild(registrar);

  if (!lista.length) {
    raiz.appendChild(blocoVazio('Nenhum peso registrado ainda.'));
    return;
  }

  raiz.appendChild(cardResumo(resumo));

  const card = document.createElement('div');
  card.className = 'card';
  lista.forEach((registro, i) =>
    card.appendChild(linhaDePeso(registro, lista[i + 1] ?? null))
  );
  raiz.appendChild(card);
}

/** Peso atual e variação desde o primeiro registro. */
function cardResumo(resumo) {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.marginTop = '12px';

  const atual = document.createElement('h2');
  atual.textContent = num(resumo.ultimo.kg, 1) + ' kg';
  atual.style.margin = '0';
  card.appendChild(atual);

  const detalhe = document.createElement('p');
  detalhe.className = 'texto-fraco pequeno';
  detalhe.style.margin = '2px 0 0';
  const partes = [descreverDistancia(resumo.ultimo.data)];
  if (resumo.primeiro.id !== resumo.ultimo.id) {
    partes.push(
      `${comSinal(resumo.variacao, 1)} kg desde ${formatarLongo(resumo.primeiro.data)}`
    );
  }
  detalhe.textContent = partes.join(' · ');
  card.appendChild(detalhe);

  return card;
}

/**
 * Uma linha do histórico, com a variação em relação ao registro anterior.
 * @param {Object} registro
 * @param {Object|null} anterior o registro imediatamente mais antigo
 * @returns {HTMLElement}
 */
function linhaDePeso(registro, anterior) {
  const div = document.createElement('div');
  div.className = 'linha-musculo linha-lista';

  const data = document.createElement('span');
  data.textContent = formatarLongo(registro.data);
  div.appendChild(data);

  const kg = document.createElement('span');
  kg.style.fontVariantNumeric = 'tabular-nums';
  kg.textContent = num(registro.kg, 1) + ' kg';
  div.appendChild(kg);

  const variacao = document.createElement('span');
  variacao.className = 'texto-fraco pequeno';
  variacao.style.minWidth = '48px';
  variacao.style.textAlign = 'right';
  variacao.textContent = anterior ? comSinal(registro.kg - anterior.kg, 1) : '';
  div.appendChild(variacao);

  const menu = document.createElement('button');
  menu.className = 'btn btn-icone';
  menu.textContent = '⋯';
  menu.setAttribute('aria-label', 'Opções do registro');
  menu.onclick = () => menuDoRegistro(registro);
  div.appendChild(menu);

  return div;
}

/** Editar ou excluir um registro. */
async function menuDoRegistro(registro) {
  const acao = await escolher(
    formatarLongo(registro.data) + ' · ' + num(registro.kg, 1) + ' kg',
    [
      { valor: 'editar', rotulo: 'Editar' },
      { valor: 'excluir', rotulo: 'Excluir' },
    ]
  );

  if (acao === 'editar') return abrirFormulario(registro);

  if (acao === 'excluir') {
    const ok = await confirmar(
      'Excluir o peso de ' + formatarLongo(registro.data) + '?',
      'As comparações que usavam este peso passam a usar o registro anterior.'
    );
    if (!ok) return;
    await peso.removerPeso(registro.id);
    await recarregar();
  }
}

/**
 * Formulário de registro, novo ou edição.
 * @param {Object} [registro]
 */
async function abrirFormulario(registro) {
  const dados = await formulario(
    registro ? 'Editar peso' : 'Registrar peso',
    [
      {
        nome: 'data',
        rotulo: 'Data',
        tipo: 'date',
        valor: registro ? registro.data : hojeIso(),
      },
      {
        nome: 'kg',
        rotulo: 'Peso (kg)',
        tipo: 'number',
        valor: registro ? num(registro.kg, 1) : '',
        dica: 'Um registro por data. Gravar de novo na mesma data substitui o anterior.',
      },
    ],
    registro ? 'Salvar' : 'Registrar'
  );
  if (!dados) return;

  const kg = paraNumero(dados.kg);
  if (!dados.data || kg === null || kg <= 0) return;

  await peso.registrar(dados.data, kg);
  await recarregar();
}
