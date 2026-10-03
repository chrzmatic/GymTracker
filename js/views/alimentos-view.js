/** Alimentos: lista com busca, cadastro (aceita kJ) e tela de cada alimento. */

import * as dieta from '../services/dieta-service.js';
import { UNIDADES, UNIDADES_ENERGIA, INFO_NUTRIENTES, energiaEmKcal } from '../domain/nutricao.js';
import { num, paraNumero } from '../utils/format.js';
import { confirmar, formulario } from '../components/dialogo.js';
import { blocoVazio } from '../components/ui.js';
import { abrir, definirTitulo, voltarUmaTela, recarregar } from '../navegacao.js';
import { OPCOES_UNIDADE } from './dieta-comum.js';

/** Lista de alimentos, com busca. */
export async function montarAlimentos(raiz) {
  const lista = await dieta.listarAlimentos();
  raiz.innerHTML = '';

  const busca = document.createElement('input');
  busca.className = 'entrada';
  busca.type = 'search';
  busca.placeholder = 'Buscar alimento…';
  busca.autocomplete = 'off';
  raiz.appendChild(busca);

  const container = document.createElement('div');
  container.classList.add('mt-3');
  raiz.appendChild(container);

  const semAcento = (t) =>
    t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const desenhar = () => {
    const filtro = semAcento(busca.value.trim());
    const visiveis = filtro ? lista.filter((a) => semAcento(a.nome).includes(filtro)) : lista;
    container.innerHTML = '';

    if (!visiveis.length) {
      container.replaceChildren(blocoVazio('Nenhum alimento encontrado.'));
      return;
    }

    // Rótulos e valores genéricos em seções separadas, na mesma tela.
    secao(container, 'Meus rótulos', visiveis.filter((a) => !a.generico));
    secao(container, 'Valores genéricos', visiveis.filter((a) => a.generico));
  };

  busca.oninput = desenhar;
  desenhar();

  const novo = document.createElement('button');
  novo.className = 'btn btn-primario btn-bloco mt-3';
  novo.textContent = '+ novo alimento';
  novo.onclick = async () => {
    const dados = await formularioDeAlimento();
    if (!dados) return;
    const criado = await dieta.criarAlimento(dados);
    await abrir('alimento-editor', { alimentoId: criado.id });
  };
  raiz.appendChild(novo);
}

/** Seção da lista (não desenha nada se vazia). */
function secao(destino, titulo, alimentos) {
  if (!alimentos.length) return;

  const cabecalho = document.createElement('div');
  cabecalho.className = 'secao-lista';

  const h2 = document.createElement('h2');
  h2.textContent = `${titulo} (${alimentos.length})`;
  cabecalho.appendChild(h2);

  destino.appendChild(cabecalho);
  alimentos.forEach((a) => destino.appendChild(cardDeAlimento(a)));
}

/** Card de um alimento. */
function cardDeAlimento(alimento) {
  const card = document.createElement('div');
  card.className = 'card card-clicavel';

  const cab = document.createElement('div');
  cab.className = 'card-cabecalho';
  const h3 = document.createElement('h3');
  h3.textContent = alimento.nome;
  cab.appendChild(h3);

  if (alimento.conferir) {
    const etq = document.createElement('span');
    etq.className = 'etiqueta etiqueta-aviso';
    etq.textContent = 'conferir';
    cab.appendChild(etq);
  }
  card.appendChild(cab);

  const p = document.createElement('p');
  p.className = 'texto-fraco pequeno m-0';
  p.textContent =
    `${num(alimento.quantidadeRef, 2)} ${alimento.unidade} · ` +
    `${num(alimento.kcal, 0)} kcal · P ${num(alimento.proteina, 1)} · ` +
    `G ${num(alimento.gordura, 1)} · C ${num(alimento.carbo, 1)}`;
  card.appendChild(p);

  card.onclick = () => abrir('alimento-editor', { alimentoId: alimento.id });
  return card;
}

/** Formulário de alimento (criar e editar). Devolve os dados ou null. */
async function formularioDeAlimento(alimento) {
  const dados = await formulario(
    alimento ? 'Editar alimento' : 'Novo alimento',
    [
      { nome: 'nome', rotulo: 'Nome', valor: alimento?.nome ?? '' },
      {
        nome: 'quantidadeRef',
        rotulo: 'Quantidade de referência',
        tipo: 'number',
        valor: alimento?.quantidadeRef ?? 100,
        dica: 'Os valores abaixo são para esta quantidade. Qualquer outra o app calcula por regra de três.',
      },
      {
        nome: 'unidade',
        rotulo: 'Unidade',
        tipo: 'select',
        valor: alimento?.unidade ?? UNIDADES.G,
        opcoes: OPCOES_UNIDADE,
      },
      { nome: 'kcal', rotulo: 'Calorias', tipo: 'number', valor: alimento?.kcal ?? '' },
      {
        nome: 'unidadeEnergia',
        rotulo: 'Calorias em',
        tipo: 'select',
        valor: UNIDADES_ENERGIA.KCAL,
        opcoes: [
          { valor: UNIDADES_ENERGIA.KCAL, rotulo: 'kcal' },
          { valor: UNIDADES_ENERGIA.KJ, rotulo: 'kJ (converte para kcal ao salvar)' },
        ],
      },
      { nome: 'proteina', rotulo: 'Proteína (g)', tipo: 'number', valor: alimento?.proteina ?? '' },
      { nome: 'gordura', rotulo: 'Gordura (g)', tipo: 'number', valor: alimento?.gordura ?? '' },
      { nome: 'carbo', rotulo: 'Carboidrato (g)', tipo: 'number', valor: alimento?.carbo ?? '' },
      {
        nome: 'fibra',
        rotulo: 'Fibra (g)',
        tipo: 'number',
        valor: alimento?.fibra ?? '',
        dica: 'Em branco conta como zero. Kcal e macros em branco marcam o item como incompleto; a fibra não.',
      },
      { nome: 'fonte', rotulo: 'Fonte', valor: alimento?.fonte ?? '', placeholder: 'Rótulo, TACO, USDA…' },
      {
        nome: 'generico',
        rotulo: 'Valor genérico (não é do rótulo)',
        tipo: 'checkbox',
        valor: alimento?.generico ?? false,
      },
    ],
    alimento ? 'Salvar' : 'Criar'
  );
  if (!dados || !dados.nome.trim()) return null;

  return {
    nome: dados.nome,
    quantidadeRef: paraNumero(dados.quantidadeRef) ?? 100,
    unidade: dados.unidade,
    kcal: energiaEmKcal(paraNumero(dados.kcal), dados.unidadeEnergia),
    proteina: paraNumero(dados.proteina),
    gordura: paraNumero(dados.gordura),
    carbo: paraNumero(dados.carbo),
    fibra: paraNumero(dados.fibra),
    fonte: dados.fonte,
    generico: dados.generico,
  };
}

/**
 * Tela de um alimento.
 * @param {HTMLElement} raiz
 * @param {{alimentoId: string}} params
 */
export async function montarEditorDeAlimento(raiz, params) {
  const alimento = await dieta.buscarAlimento(params.alimentoId);
  if (!alimento) {
    await voltarUmaTela();
    return;
  }
  definirTitulo(alimento.nome);
  raiz.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = `Por ${num(alimento.quantidadeRef, 2)} ${alimento.unidade}`;
  h3.classList.add('m-0', 'mb-2');
  card.appendChild(h3);

  INFO_NUTRIENTES.forEach(({ id, rotulo, unidade, casas }) => {
    const valor = alimento[id];
    const linha = document.createElement('div');
    linha.className = 'metrica';
    const nome = document.createElement('span');
    nome.className = 'metrica-rotulo';
    nome.textContent = rotulo;
    const v = document.createElement('span');
    v.className = 'metrica-valor';
    v.textContent = valor === null || valor === undefined ? '— em branco' : `${num(valor, casas)} ${unidade}`;
    if (valor === null || valor === undefined) v.classList.add('texto-fraco');
    linha.append(nome, v, document.createElement('span'), document.createElement('span'));
    card.appendChild(linha);
  });

  if (alimento.fonte) {
    const fonte = document.createElement('p');
    fonte.className = 'texto-fraco pequeno m-0 mt-2';
    fonte.textContent = 'Fonte: ' + alimento.fonte + (alimento.generico ? ' (valor genérico)' : '');
    card.appendChild(fonte);
  }
  if (alimento.observacao) {
    const obs = document.createElement('p');
    obs.className = 'texto-fraco pequeno m-0 mt-1';
    obs.textContent = alimento.observacao;
    card.appendChild(obs);
  }

  const editar = document.createElement('button');
  editar.className = 'btn btn-bloco mt-3';
  editar.textContent = 'Editar valores';
  editar.onclick = async () => {
    const dados = await formularioDeAlimento(alimento);
    if (!dados) return;
    await dieta.salvarAlimento({ ...alimento, ...dados });
    await recarregar();
  };
  card.appendChild(editar);
  raiz.appendChild(card);

  if (alimento.conferir) {
    const aviso = document.createElement('div');
    aviso.className = 'faixa-aviso';
    aviso.textContent =
      'Este valor veio marcado como "a conferir" nos dados iniciais. Editar qualquer valor tira o aviso.';
    raiz.appendChild(aviso);
  }

  const excluir = document.createElement('button');
  excluir.className = 'btn btn-perigo btn-bloco mt-2';
  excluir.textContent = 'Excluir alimento';
  excluir.onclick = async () => {
    const uso = await dieta.ondeAlimentoEUsado(alimento.id);
    const partes = [];
    if (uso.pratos.length) partes.push(`Está nos pratos: ${uso.pratos.join(', ')}.`);
    if (uso.refeicoes.length) partes.push(`Está nas refeições: ${uso.refeicoes.join(', ')}.`);
    partes.push(
      partes.length
        ? 'Ele será removido desses lugares, o que muda os valores calculados.'
        : 'Ele não está em nenhum prato nem refeição.'
    );

    const ok = await confirmar('Excluir ' + alimento.nome + '?', partes.join(' '));
    if (!ok) return;
    await dieta.excluirAlimento(alimento.id);
    await voltarUmaTela();
    await recarregar();
  };
  raiz.appendChild(excluir);
}
