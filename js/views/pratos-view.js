/** Pratos compostos: lista e tela de cada prato, com os ingredientes. */

import * as dieta from '../services/dieta-service.js';
import { calcularPrato } from '../domain/nutricao.js';
import { num, paraNumero } from '../utils/format.js';
import { confirmar, formulario } from '../components/dialogo.js';
import { blocoVazio } from '../components/ui.js';
import { abrir, definirTitulo, voltarUmaTela, recarregar } from '../navegacao.js';
import { escolherAlimento } from './dieta-comum.js';

/** Lista de pratos. */
export async function montarPratos(raiz) {
  const [pratos, indice] = await Promise.all([dieta.listarPratos(), dieta.carregarIndice()]);
  raiz.innerHTML = '';

  if (!pratos.length) {
    raiz.appendChild(blocoVazio('Nenhum prato composto ainda.'));
  }

  pratos.forEach((prato) => {
    const r = calcularPrato(prato, indice.alimentos);
    const card = document.createElement('div');
    card.className = 'card card-clicavel';

    const cab = document.createElement('div');
    cab.className = 'card-cabecalho';
    const h3 = document.createElement('h3');
    h3.textContent = prato.nome;
    cab.appendChild(h3);
    if (r.incompleto) {
      const etq = document.createElement('span');
      etq.className = 'etiqueta etiqueta-aviso';
      etq.textContent = 'incompleto';
      cab.appendChild(etq);
    }
    card.appendChild(cab);

    const p = document.createElement('p');
    p.className = 'texto-fraco pequeno m-0';
    p.textContent =
      `${num(r.valores.kcal, 0)} kcal · P ${num(r.valores.proteina, 1)} g · ` +
      `G ${num(r.valores.gordura, 1)} g · C ${num(r.valores.carbo, 1)} g`;
    card.appendChild(p);

    const ing = document.createElement('p');
    ing.className = 'texto-fraco pequeno m-0 mt-1';
    ing.textContent = r.ingredientes.map((i) => i.nome).join(' + ') || 'Sem ingredientes';
    card.appendChild(ing);

    card.onclick = () => abrir('prato-editor', { pratoId: prato.id });
    raiz.appendChild(card);
  });

  const novo = document.createElement('button');
  novo.className = 'btn btn-primario btn-bloco mt-3';
  novo.textContent = '+ novo prato';
  novo.onclick = async () => {
    const dados = await formulario('Novo prato', [{ nome: 'nome', rotulo: 'Nome' }], 'Criar');
    if (!dados || !dados.nome.trim()) return;
    const criado = await dieta.criarPrato(dados.nome);
    await abrir('prato-editor', { pratoId: criado.id });
  };
  raiz.appendChild(novo);
}

/**
 * Tela de um prato.
 * @param {HTMLElement} raiz
 * @param {{pratoId: string}} params
 */
export async function montarEditorDePrato(raiz, params) {
  const r = await dieta.calcularPratoPorId(params.pratoId);
  if (!r) {
    await voltarUmaTela();
    return;
  }
  const { prato } = r;
  definirTitulo(prato.nome);
  raiz.innerHTML = '';

  const totais = document.createElement('div');
  totais.className = 'card card-sugestao';
  const h2 = document.createElement('h2');
  h2.textContent = num(r.valores.kcal, 0) + ' kcal';
  h2.classList.add('m-0', 'mb-1');
  totais.appendChild(h2);
  const macros = document.createElement('p');
  macros.className = 'texto-fraco pequeno m-0';
  macros.textContent =
    `P ${num(r.valores.proteina, 1)} g · G ${num(r.valores.gordura, 1)} g · ` +
    `C ${num(r.valores.carbo, 1)} g · Fibra ${num(r.valores.fibra, 1)} g`;
  totais.appendChild(macros);
  raiz.appendChild(totais);

  const card = document.createElement('div');
  card.className = 'card';
  const h3 = document.createElement('h3');
  h3.textContent = 'Ingredientes';
  h3.classList.add('m-0', 'mb-2');
  card.appendChild(h3);

  if (!r.ingredientes.length) {
    const vazio = document.createElement('p');
    vazio.className = 'texto-fraco pequeno';
    vazio.textContent = 'Nenhum ingrediente ainda.';
    card.appendChild(vazio);
  }

  r.ingredientes.forEach((ing, i) => {
    const linha = document.createElement('div');
    linha.className = 'linha-musculo linha-lista';

    const nome = document.createElement('span');
    nome.textContent = ing.nome;
    linha.appendChild(nome);

    const quantidade = document.createElement('button');
    quantidade.className = 'pilula';
    quantidade.textContent =
      ing.quantidade === null || ing.quantidade === undefined
        ? '— preencher'
        : `${num(ing.quantidade, 2)} ${ing.unidade}`;
    if (ing.quantidade === null || ing.quantidade === undefined) {
      quantidade.setAttribute('aria-pressed', 'false');
      quantidade.classList.add('pilula-aviso');
    }
    quantidade.onclick = async () => {
      const dados = await formulario(ing.nome, [
        {
          nome: 'q',
          rotulo: `Quantidade (${ing.unidade})`,
          tipo: 'number',
          valor: ing.quantidade ?? '',
        },
      ]);
      if (!dados) return;
      const ingredientes = prato.ingredientes.map((x, j) =>
        j === i ? { ...x, quantidade: paraNumero(dados.q) } : x
      );
      await dieta.salvarPrato({ ...prato, ingredientes });
      await recarregar();
    };
    linha.appendChild(quantidade);

    const kcal = document.createElement('span');
    kcal.className = 'texto-fraco pequeno';
    kcal.textContent = num(ing.valores.kcal, 0) + ' kcal';
    linha.appendChild(kcal);

    const remover = document.createElement('button');
    remover.className = 'btn btn-icone';
    remover.textContent = '×';
    remover.setAttribute('aria-label', 'Remover ingrediente');
    remover.onclick = async () => {
      await dieta.salvarPrato({
        ...prato,
        ingredientes: prato.ingredientes.filter((_, j) => j !== i),
      });
      await recarregar();
    };
    linha.appendChild(remover);

    card.appendChild(linha);
  });

  const add = document.createElement('button');
  add.className = 'btn btn-bloco mt-3';
  add.textContent = '+ ingrediente';
  add.onclick = async () => {
    const alimentoId = await escolherAlimento('Adicionar ingrediente');
    if (!alimentoId) return;
    const alimento = await dieta.buscarAlimento(alimentoId);
    const dados = await formulario(alimento.nome, [
      { nome: 'q', rotulo: `Quantidade (${alimento.unidade})`, tipo: 'number', valor: '' },
    ]);
    if (!dados) return;
    await dieta.salvarPrato({
      ...prato,
      ingredientes: [...(prato.ingredientes ?? []), { alimentoId, quantidade: paraNumero(dados.q) }],
    });
    await recarregar();
  };
  card.appendChild(add);
  raiz.appendChild(card);

  const excluir = document.createElement('button');
  excluir.className = 'btn btn-perigo btn-bloco mt-2';
  excluir.textContent = 'Excluir prato';
  excluir.onclick = async () => {
    const onde = await dieta.ondePratoEUsado(prato.id);
    const ok = await confirmar(
      'Excluir ' + prato.nome + '?',
      onde.length
        ? `Ele está nas refeições: ${onde.join(', ')}. Será removido delas.`
        : 'Ele não está em nenhuma refeição.'
    );
    if (!ok) return;
    await dieta.excluirPrato(prato.id);
    await voltarUmaTela();
    await recarregar();
  };
  raiz.appendChild(excluir);
}
