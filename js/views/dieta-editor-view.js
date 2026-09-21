/**
 * Telas de edição da dieta: índice de alimentos, pratos compostos e
 * refeições.
 *
 * As três moram no mesmo arquivo porque compartilham o mesmo vocabulário
 * (alimento, quantidade, unidade) e os mesmos diálogos — separar em três
 * arquivos duplicaria o formulário de quantidade em todos.
 *
 * Nenhuma delas guarda kcal: elas editam alimento e quantidade, e os
 * valores mostrados são sempre calculados na hora.
 */

import * as dieta from '../services/dieta-service.js';
import { UNIDADES, TIPO_ITEM } from '../domain/nutricao.js';
import { num, paraNumero } from '../utils/format.js';
import {
  confirmar,
  escolher,
  escolherComBusca,
  formulario,
  avisar,
} from '../components/dialogo.js';
import { blocoVazio, textoFraco } from '../components/ui.js';
import { abrir, definirTitulo, voltarUmaTela, recarregar } from '../navegacao.js';

/** Opções de unidade nos formulários. */
const OPCOES_UNIDADE = [
  { valor: UNIDADES.G, rotulo: 'gramas (g)' },
  { valor: UNIDADES.ML, rotulo: 'mililitros (ml)' },
  { valor: UNIDADES.UNIDADE, rotulo: 'unidade (fatia, lata, ovo…)' },
];

/* ================================================================== */
/* Índice de alimentos                                                 */
/* ================================================================== */

/**
 * Lista do índice, com busca.
 * @param {HTMLElement} raiz
 * @returns {Promise<void>}
 */
export async function montarAlimentos(raiz) {
  const lista = await dieta.listarAlimentos();
  raiz.innerHTML = '';

  const intro = document.createElement('p');
  intro.className = 'texto-fraco pequeno';
  intro.textContent =
    'Os planos guardam só alimento e quantidade. Corrigir um valor aqui atualiza o dia inteiro na hora.';
  raiz.appendChild(intro);

  const busca = document.createElement('input');
  busca.className = 'entrada';
  busca.type = 'search';
  busca.placeholder = 'Buscar alimento…';
  busca.autocomplete = 'off';
  raiz.appendChild(busca);

  const container = document.createElement('div');
  container.style.marginTop = '12px';
  raiz.appendChild(container);

  const semAcento = (t) =>
    t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const desenhar = () => {
    const filtro = semAcento(busca.value.trim());
    const visiveis = filtro ? lista.filter((a) => semAcento(a.nome).includes(filtro)) : lista;
    container.innerHTML = '';

    if (!visiveis.length) {
      container.innerHTML = '<div class="vazio">Nenhum alimento encontrado.</div>';
      return;
    }

    // Duas seções na mesma tela, não duas abas: separar o que veio do
    // rótulo do produto do que é média de tabela evita tratar os dois com
    // a mesma confiança, mas continuar vendo tudo de uma vez importa na
    // hora de procurar um alimento.
    secao(container, 'Meus rótulos', 'valores do produto que você compra',
      visiveis.filter((a) => !a.generico));
    secao(container, 'Valores genéricos', 'médias de tabela, para substituir quando tiver o rótulo',
      visiveis.filter((a) => a.generico));
  };

  busca.oninput = desenhar;
  desenhar();

  const novo = document.createElement('button');
  novo.className = 'btn btn-primario btn-bloco';
  novo.style.marginTop = '12px';
  novo.textContent = '+ novo alimento';
  novo.onclick = async () => {
    const dados = await formularioDeAlimento();
    if (!dados) return;
    const criado = await dieta.criarAlimento(dados);
    await abrir('alimento-editor', { alimentoId: criado.id });
  };
  raiz.appendChild(novo);
}

/**
 * Uma seção da lista de alimentos, com título e explicação.
 * Não desenha nada se a seção estiver vazia.
 * @param {HTMLElement} destino
 * @param {string} titulo
 * @param {string} explicacao
 * @param {Object[]} alimentos
 */
function secao(destino, titulo, explicacao, alimentos) {
  if (!alimentos.length) return;

  const cabecalho = document.createElement('div');
  cabecalho.className = 'secao-lista';

  const h2 = document.createElement('h2');
  h2.textContent = `${titulo} (${alimentos.length})`;
  cabecalho.appendChild(h2);

  const nota = document.createElement('span');
  nota.className = 'explicacao';
  nota.textContent = explicacao;
  cabecalho.appendChild(nota);

  destino.appendChild(cabecalho);
  alimentos.forEach((a) => destino.appendChild(cardDeAlimento(a)));
}

/** Card de um alimento na lista. */
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
  p.className = 'texto-fraco pequeno';
  p.style.margin = '0';
  p.textContent =
    `${num(alimento.quantidadeRef, 2)} ${alimento.unidade} · ` +
    `${num(alimento.kcal, 0)} kcal · P ${num(alimento.proteina, 1)} · ` +
    `G ${num(alimento.gordura, 1)} · C ${num(alimento.carbo, 1)}`;
  card.appendChild(p);

  card.onclick = () => abrir('alimento-editor', { alimentoId: alimento.id });
  return card;
}

/**
 * Formulário de alimento, usado ao criar e ao editar.
 * @param {Object} [alimento]
 * @returns {Promise<Object|null>}
 */
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
      { nome: 'kcal', rotulo: 'Calorias (kcal)', tipo: 'number', valor: alimento?.kcal ?? '' },
      { nome: 'proteina', rotulo: 'Proteína (g)', tipo: 'number', valor: alimento?.proteina ?? '' },
      { nome: 'gordura', rotulo: 'Gordura (g)', tipo: 'number', valor: alimento?.gordura ?? '' },
      { nome: 'carbo', rotulo: 'Carboidrato (g)', tipo: 'number', valor: alimento?.carbo ?? '' },
      {
        nome: 'fibra',
        rotulo: 'Fibra (g)',
        tipo: 'number',
        valor: alimento?.fibra ?? '',
        dica: 'Deixe em branco o que não souber: em branco conta zero na soma, mas o app marca o item como incompleto.',
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
    kcal: paraNumero(dados.kcal),
    proteina: paraNumero(dados.proteina),
    gordura: paraNumero(dados.gordura),
    carbo: paraNumero(dados.carbo),
    fibra: paraNumero(dados.fibra),
    fonte: dados.fonte,
    generico: dados.generico,
  };
}

/**
 * Editor de um alimento.
 * @param {HTMLElement} raiz
 * @param {{alimentoId: string}} params
 * @returns {Promise<void>}
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
  h3.style.margin = '0 0 8px';
  card.appendChild(h3);

  [
    ['Calorias', alimento.kcal, 'kcal', 0],
    ['Proteína', alimento.proteina, 'g', 1],
    ['Gordura', alimento.gordura, 'g', 1],
    ['Carboidrato', alimento.carbo, 'g', 1],
    ['Fibra', alimento.fibra, 'g', 1],
  ].forEach(([rotulo, valor, unidade, casas]) => {
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
    fonte.className = 'texto-fraco pequeno';
    fonte.style.margin = '8px 0 0';
    fonte.textContent = 'Fonte: ' + alimento.fonte + (alimento.generico ? ' (valor genérico)' : '');
    card.appendChild(fonte);
  }
  if (alimento.observacao) {
    const obs = document.createElement('p');
    obs.className = 'texto-fraco pequeno';
    obs.style.margin = '2px 0 0';
    obs.textContent = alimento.observacao;
    card.appendChild(obs);
  }

  const editar = document.createElement('button');
  editar.className = 'btn btn-bloco';
  editar.style.marginTop = '10px';
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
  excluir.className = 'btn btn-perigo btn-bloco';
  excluir.style.marginTop = '8px';
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

/* ================================================================== */
/* Pratos compostos                                                    */
/* ================================================================== */

/**
 * Lista de pratos compostos.
 * @param {HTMLElement} raiz
 * @returns {Promise<void>}
 */
export async function montarPratos(raiz) {
  const [pratos, indice] = await Promise.all([dieta.listarPratos(), dieta.carregarIndice()]);
  raiz.innerHTML = '';

  const intro = document.createElement('p');
  intro.className = 'texto-fraco pequeno';
  intro.textContent =
    'Um prato é uma combinação de alimentos do índice. Os valores dele são sempre calculados dos ingredientes.';
  raiz.appendChild(intro);

  if (!pratos.length) {
    raiz.appendChild(blocoVazio('Nenhum prato composto ainda.'));
  }

  const { calcularPrato } = await import('../domain/nutricao.js');

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
    p.className = 'texto-fraco pequeno';
    p.style.margin = '0';
    p.textContent =
      `${num(r.valores.kcal, 0)} kcal · P ${num(r.valores.proteina, 1)} g · ` +
      `G ${num(r.valores.gordura, 1)} g · C ${num(r.valores.carbo, 1)} g`;
    card.appendChild(p);

    const ing = document.createElement('p');
    ing.className = 'texto-fraco pequeno';
    ing.style.margin = '4px 0 0';
    ing.textContent = r.ingredientes.map((i) => i.nome).join(' + ') || 'Sem ingredientes';
    card.appendChild(ing);

    card.onclick = () => abrir('prato-editor', { pratoId: prato.id });
    raiz.appendChild(card);
  });

  const novo = document.createElement('button');
  novo.className = 'btn btn-primario btn-bloco';
  novo.style.marginTop = '12px';
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
 * Editor de um prato composto.
 * @param {HTMLElement} raiz
 * @param {{pratoId: string}} params
 * @returns {Promise<void>}
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
  h2.style.margin = '0 0 2px';
  totais.appendChild(h2);
  const macros = document.createElement('p');
  macros.className = 'texto-fraco pequeno';
  macros.style.margin = '0';
  macros.textContent =
    `P ${num(r.valores.proteina, 1)} g · G ${num(r.valores.gordura, 1)} g · ` +
    `C ${num(r.valores.carbo, 1)} g · Fibra ${num(r.valores.fibra, 1)} g`;
  totais.appendChild(macros);
  raiz.appendChild(totais);

  const card = document.createElement('div');
  card.className = 'card';
  const h3 = document.createElement('h3');
  h3.textContent = 'Ingredientes';
  h3.style.margin = '0 0 8px';
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
      quantidade.style.borderColor = 'var(--aviso)';
      quantidade.style.color = 'var(--aviso)';
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
  add.className = 'btn btn-bloco';
  add.style.marginTop = '10px';
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
  excluir.className = 'btn btn-perigo btn-bloco';
  excluir.style.marginTop = '8px';
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

/* ================================================================== */
/* Plano: as refeições que o compõem                                   */
/* ================================================================== */

/**
 * Editor de um plano: quais refeições ele tem, em que ordem.
 *
 * A ordem mora na lista do plano, não num campo da refeição, porque o
 * jantar é o mesmo objeto nos dois planos e pode ocupar posições
 * diferentes em cada um.
 *
 * @param {HTMLElement} raiz
 * @param {{planoId: string}} params
 * @returns {Promise<void>}
 */
export async function montarEditorDePlano(raiz, params) {
  const [plano, dia] = await Promise.all([
    dieta.buscarPlano(params.planoId),
    dieta.calcularDia(params.planoId),
  ]);
  if (!plano || !dia) {
    await voltarUmaTela();
    return;
  }

  definirTitulo(plano.nome);
  raiz.innerHTML = '';

  raiz.appendChild(
    textoFraco(
      'As refeições deste plano, na ordem do dia. Uma refeição pode estar nos dois planos ao mesmo tempo — editar nela vale para os dois.'
    )
  );

  const totais = document.createElement('div');
  totais.className = 'card card-sugestao';
  const h2 = document.createElement('h2');
  h2.style.margin = '0 0 2px';
  h2.textContent = dia.varia
    ? `${num(dia.minimo.kcal, 0)}–${num(dia.maximo.kcal, 0)} kcal`
    : `${num(dia.total.kcal, 0)} kcal`;
  totais.appendChild(h2);
  totais.appendChild(
    textoFraco(
      dia.metas.kcal
        ? `Meta: ${num(dia.metas.kcal, 0)} kcal`
        : 'Sem meta de calorias definida.',
      '0'
    )
  );

  const renomear = document.createElement('button');
  renomear.className = 'btn btn-bloco';
  renomear.style.marginTop = '10px';
  renomear.textContent = 'Renomear o plano';
  renomear.onclick = async () => {
    const dados = await formulario('Renomear plano', [
      { nome: 'nome', rotulo: 'Nome', valor: plano.nome },
    ]);
    if (!dados || !dados.nome.trim()) return;
    await dieta.renomearPlano(plano.id, dados.nome);
    await recarregar();
  };
  totais.appendChild(renomear);
  raiz.appendChild(totais);

  if (!dia.refeicoes.length) {
    raiz.appendChild(blocoVazio('Este plano ainda não tem refeições.'));
  }

  dia.refeicoes.forEach((r, i) =>
    raiz.appendChild(cardDeRefeicaoNoPlano(plano, r, i, dia.refeicoes.length))
  );

  const adicionar = document.createElement('button');
  adicionar.className = 'btn btn-primario btn-bloco';
  adicionar.style.marginTop = '12px';
  adicionar.textContent = '+ refeição';
  adicionar.onclick = () => adicionarRefeicao(plano);
  raiz.appendChild(adicionar);
}

/**
 * Card de uma refeição dentro do editor do plano.
 * @param {Object} plano
 * @param {Object} r refeição calculada
 * @param {number} indice posição na lista
 * @param {number} total quantas refeições o plano tem
 * @returns {HTMLElement}
 */
function cardDeRefeicaoNoPlano(plano, r, indice, total) {
  const card = document.createElement('div');
  card.className = 'card card-clicavel';

  const cab = document.createElement('div');
  cab.className = 'card-cabecalho';

  const ordem = document.createElement('span');
  ordem.className = 'ordem-item';
  ordem.textContent = indice + 1 + 'º';
  cab.appendChild(ordem);

  const h3 = document.createElement('h3');
  h3.textContent = r.nome;
  cab.appendChild(h3);

  cab.appendChild(setaDeRefeicao(plano, r, -1, indice > 0));
  cab.appendChild(setaDeRefeicao(plano, r, 1, indice < total - 1));

  const menu = document.createElement('button');
  menu.className = 'btn btn-icone';
  menu.textContent = '⋯';
  menu.setAttribute('aria-label', 'Opções da refeição');
  menu.onclick = (ev) => {
    ev.stopPropagation();
    menuDaRefeicao(plano, r);
  };
  cab.appendChild(menu);
  card.appendChild(cab);

  const resumo = document.createElement('p');
  resumo.className = 'texto-fraco pequeno';
  resumo.style.margin = '0';
  const kcal = r.varia
    ? `${num(r.minimo.kcal, 0)}–${num(r.maximo.kcal, 0)} kcal`
    : `${num(r.total.kcal, 0)} kcal`;
  resumo.textContent =
    `${r.itens.length} ${r.itens.length === 1 ? 'item' : 'itens'} · ${kcal} · ` +
    `P ${num(r.total.proteina, 1)} g`;
  card.appendChild(resumo);

  card.onclick = () => abrir('refeicao', { refeicaoId: r.refeicaoId });
  return card;
}

/** Seta de reordenação da refeição dentro do plano. */
function setaDeRefeicao(plano, r, direcao, ativo) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-icone btn-mover';
  btn.textContent = direcao === -1 ? '↑' : '↓';
  btn.setAttribute('aria-label', direcao === -1 ? 'Subir refeição' : 'Descer refeição');
  btn.disabled = !ativo;
  btn.onclick = async (ev) => {
    ev.stopPropagation();
    await dieta.moverRefeicaoNoPlano(plano.id, r.refeicaoId, direcao);
    await recarregar();
  };
  return btn;
}

/** Menu de uma refeição dentro do plano. */
async function menuDaRefeicao(plano, r) {
  const planos = await dieta.planosComRefeicao(r.refeicaoId);
  const compartilhada = planos.length > 1;

  const acao = await escolher(r.nome, [
    { valor: 'editar', rotulo: 'Editar os itens' },
    { valor: 'renomear', rotulo: 'Renomear' },
    {
      valor: 'remover',
      rotulo: 'Tirar deste plano',
      detalhe: compartilhada ? 'fica no outro' : 'apaga a refeição',
    },
  ]);

  if (acao === 'editar') return abrir('refeicao', { refeicaoId: r.refeicaoId });

  if (acao === 'renomear') {
    const dados = await formulario('Renomear refeição', [
      {
        nome: 'nome',
        rotulo: 'Nome',
        valor: r.nome,
        dica: compartilhada
          ? `Esta refeição também está em: ${planos.filter((p) => p !== plano.nome).join(', ')}. O nome muda lá também.`
          : undefined,
      },
    ]);
    if (!dados || !dados.nome.trim()) return;
    await dieta.renomearRefeicao(r.refeicaoId, dados.nome);
    return recarregar();
  }

  if (acao === 'remover') {
    const ok = await confirmar(
      'Tirar ' + r.nome + ' deste plano?',
      compartilhada
        ? `Ela continua em: ${planos.filter((p) => p !== plano.nome).join(', ')}.`
        : 'Como ela não está em nenhum outro plano, será apagada junto com os itens dela.',
      'Tirar'
    );
    if (!ok) return;
    await dieta.removerRefeicaoDoPlano(plano.id, r.refeicaoId);
    return recarregar();
  }
}

/** Cria uma refeição nova ou traz uma que já existe. */
async function adicionarRefeicao(plano) {
  const disponiveis = await dieta.refeicoesForaDoPlano(plano.id);

  const opcoes = [{ valor: '__nova', rotulo: 'Criar uma refeição nova' }];
  if (disponiveis.length) {
    opcoes.push({
      valor: '__existente',
      rotulo: 'Usar uma refeição que já existe',
      detalhe: 'compartilhada',
    });
  }

  const escolha = await escolher('Adicionar refeição', opcoes);
  if (!escolha) return;

  if (escolha === '__nova') {
    const dados = await formulario(
      'Nova refeição',
      [{ nome: 'nome', rotulo: 'Nome', placeholder: 'Almoço' }],
      'Criar'
    );
    if (!dados || !dados.nome.trim()) return;
    const criada = await dieta.criarRefeicaoNoPlano(plano.id, dados.nome);
    await abrir('refeicao', { refeicaoId: criada.id });
    return;
  }

  const refeicaoId = await escolher(
    'Qual refeição?',
    disponiveis.map((r) => ({
      valor: r.id,
      rotulo: r.nome,
      detalhe: `${(r.itens ?? []).length} itens`,
    }))
  );
  if (!refeicaoId) return;

  await dieta.adicionarRefeicaoAoPlano(plano.id, refeicaoId);
  await avisar(
    'Refeição compartilhada',
    'Ela agora está nos dois planos. Editar os itens dela vale para os dois.'
  );
  await recarregar();
}

/* ================================================================== */
/* Detalhe nutricional de um item                                      */
/* ================================================================== */

/**
 * Tela de um item do plano: o que ele entrega na quantidade planejada.
 *
 * Mostra duas coisas lado a lado, porque são perguntas diferentes: "o que
 * esta banana me dá hoje" (a quantidade do plano) e "quanto vale por 100
 * g" (a referência do índice, que é o que está no rótulo).
 *
 * @param {HTMLElement} raiz
 * @param {{refeicaoId: string, itemId: string, opcaoId?: string}} params
 * @returns {Promise<void>}
 */
export async function montarNutricional(raiz, params) {
  const [dados, indice] = await Promise.all([
    dieta.buscarItem(params.refeicaoId, params.itemId, params.opcaoId),
    dieta.carregarIndice(),
  ]);
  if (!dados) {
    await voltarUmaTela();
    return;
  }

  const { calcularItem, calcularOpcao } = await import('../domain/nutricao.js');
  const alvo = dados.opcao ?? dados.item;
  const calculo = dados.opcao
    ? calcularOpcao(dados.opcao, indice)
    : calcularItem(dados.item, indice);

  const ehPrato = alvo.tipo === TIPO_ITEM.PRATO;
  const fonte = ehPrato
    ? indice.pratos.get(alvo.pratoId)
    : indice.alimentos.get(alvo.alimentoId);

  definirTitulo(calculo.nome ?? 'Item');
  raiz.innerHTML = '';

  const contexto = document.createElement('p');
  contexto.className = 'texto-fraco pequeno';
  contexto.textContent = `Em ${dados.refeicao.nome}`;
  raiz.appendChild(contexto);

  /* --- o que entrega na quantidade do plano --- */
  const card = document.createElement('div');
  card.className = 'card card-sugestao';

  const quantidade = document.createElement('h2');
  quantidade.style.margin = '0 0 2px';
  quantidade.textContent = calculo.descricao ?? '—';
  card.appendChild(quantidade);

  const kcal = document.createElement('p');
  kcal.className = 'texto-fraco pequeno';
  kcal.style.margin = '0 0 10px';
  kcal.textContent = 'nesta refeição';
  card.appendChild(kcal);

  card.appendChild(tabelaDeNutrientes(calculo.valores));

  const mudar = document.createElement('button');
  mudar.className = 'btn btn-bloco';
  mudar.style.marginTop = '10px';
  mudar.textContent = 'Mudar a quantidade';
  mudar.onclick = async () => {
    const atual = ehPrato ? (alvo.porcoes ?? 1) : alvo.quantidade;
    const unidade = ehPrato ? 'porções' : (fonte?.unidade ?? '');
    const novo = await formulario(calculo.nome, [
      {
        nome: 'q',
        rotulo: ehPrato ? 'Porções (1 = o prato inteiro)' : `Quantidade (${unidade})`,
        tipo: 'number',
        valor: atual ?? '',
      },
    ]);
    if (!novo) return;
    const valor = paraNumero(novo.q);
    if (dados.opcao) {
      await dieta.alterarQuantidadeDaOpcao(
        params.refeicaoId,
        params.itemId,
        params.opcaoId,
        valor
      );
    } else {
      await dieta.alterarQuantidade(params.refeicaoId, params.itemId, valor);
    }
    await recarregar();
  };
  card.appendChild(mudar);
  raiz.appendChild(card);

  if (!fonte) {
    const erro = document.createElement('div');
    erro.className = 'faixa-aviso';
    erro.textContent = calculo.erro ?? 'Este item não está mais no índice.';
    raiz.appendChild(erro);
    return;
  }

  /* --- a referência do índice --- */
  const referencia = document.createElement('div');
  referencia.className = 'card';

  const titulo = document.createElement('h3');
  titulo.style.margin = '0 0 8px';
  titulo.textContent = ehPrato
    ? 'O prato inteiro (1 porção)'
    : `Por ${num(fonte.quantidadeRef, 2)} ${fonte.unidade}`;
  referencia.appendChild(titulo);

  if (ehPrato) {
    const { calcularPrato } = await import('../domain/nutricao.js');
    const doPrato = calcularPrato(fonte, indice.alimentos);
    referencia.appendChild(tabelaDeNutrientes(doPrato.valores));

    const h4 = document.createElement('h3');
    h4.style.margin = '14px 0 6px';
    h4.textContent = 'Ingredientes';
    referencia.appendChild(h4);

    doPrato.ingredientes.forEach((ing) => {
      const linha = document.createElement('div');
      linha.className = 'item-dieta-linha';
      linha.style.padding = '6px 0';

      const nome = document.createElement('span');
      nome.className = 'item-dieta-nome';
      nome.textContent = ing.nome;
      linha.appendChild(nome);

      const q = document.createElement('span');
      q.className = 'item-dieta-quantidade';
      q.textContent =
        ing.quantidade === null || ing.quantidade === undefined
          ? '— preencher'
          : `${num(ing.quantidade, 2)} ${ing.unidade}`;
      linha.appendChild(q);

      const k = document.createElement('span');
      k.className = 'item-dieta-kcal';
      k.textContent = num(ing.valores.kcal, 0) + ' kcal';
      linha.appendChild(k);

      referencia.appendChild(linha);
    });
  } else {
    referencia.appendChild(tabelaDeNutrientes(valoresDoAlimento(fonte)));

    if (fonte.fonte) {
      referencia.appendChild(
        textoFraco('Fonte: ' + fonte.fonte + (fonte.generico ? ' (valor genérico)' : ''), '10px 0 0')
      );
    }
    if (fonte.observacao) referencia.appendChild(textoFraco(fonte.observacao, '2px 0 0'));
  }

  const editar = document.createElement('button');
  editar.className = 'btn btn-bloco';
  editar.style.marginTop = '10px';
  editar.textContent = ehPrato ? 'Editar este prato' : 'Editar este alimento no índice';
  editar.onclick = () =>
    ehPrato
      ? abrir('prato-editor', { pratoId: fonte.id })
      : abrir('alimento-editor', { alimentoId: fonte.id });
  referencia.appendChild(editar);

  raiz.appendChild(referencia);
}

/** Valores de referência de um alimento, já como objeto de nutrientes. */
function valoresDoAlimento(alimento) {
  return {
    kcal: alimento.kcal,
    proteina: alimento.proteina,
    gordura: alimento.gordura,
    carbo: alimento.carbo,
    fibra: alimento.fibra,
  };
}

/**
 * Tabela de nutrientes: rótulo à esquerda, valor à direita.
 * Valor ausente aparece como "— em branco", não como zero.
 * @param {Object} valores
 * @returns {HTMLElement}
 */
function tabelaDeNutrientes(valores) {
  const div = document.createElement('div');

  [
    ['Calorias', 'kcal', 'kcal', 0],
    ['Proteína', 'proteina', 'g', 1],
    ['Gordura', 'gordura', 'g', 1],
    ['Carboidrato', 'carbo', 'g', 1],
    ['Fibra', 'fibra', 'g', 1],
  ].forEach(([rotulo, chave, unidade, casas]) => {
    const linha = document.createElement('div');
    linha.className = 'nutriente';

    const nome = document.createElement('span');
    nome.textContent = rotulo;
    linha.appendChild(nome);

    const valor = document.createElement('strong');
    const v = valores[chave];
    if (v === null || v === undefined) {
      valor.textContent = '— em branco';
      valor.className = 'texto-fraco';
    } else {
      valor.textContent = `${num(v, casas)} ${unidade}`;
    }
    linha.appendChild(valor);

    div.appendChild(linha);
  });

  return div;
}

/* ================================================================== */
/* Refeição                                                            */
/* ================================================================== */

/**
 * Editor de uma refeição.
 * @param {HTMLElement} raiz
 * @param {{refeicaoId: string}} params
 * @returns {Promise<void>}
 */
export async function montarEditorDeRefeicao(raiz, params) {
  const dados = await dieta.calcularRefeicaoPorId(params.refeicaoId);
  if (!dados) {
    await voltarUmaTela();
    return;
  }
  const { refeicao, calculo } = dados;
  definirTitulo(refeicao.nome);
  raiz.innerHTML = '';

  const planos = await dieta.planosComRefeicao(refeicao.id);
  if (planos.length > 1) {
    const aviso = document.createElement('div');
    aviso.className = 'faixa-aviso';
    aviso.textContent = `Esta refeição é compartilhada por: ${planos.join(' e ')}. Editar aqui muda nos dois.`;
    raiz.appendChild(aviso);
  }

  const totais = document.createElement('div');
  totais.className = 'card card-sugestao';
  const h2 = document.createElement('h2');
  h2.textContent = calculo.varia
    ? `${num(calculo.minimo.kcal, 0)}–${num(calculo.maximo.kcal, 0)} kcal`
    : `${num(calculo.total.kcal, 0)} kcal`;
  h2.style.margin = '0 0 2px';
  totais.appendChild(h2);
  const macros = document.createElement('p');
  macros.className = 'texto-fraco pequeno';
  macros.style.margin = '0';
  macros.textContent =
    `Com as opções padrão: P ${num(calculo.total.proteina, 1)} g · ` +
    `G ${num(calculo.total.gordura, 1)} g · C ${num(calculo.total.carbo, 1)} g`;
  totais.appendChild(macros);
  raiz.appendChild(totais);

  calculo.itens.forEach((item) => raiz.appendChild(cardDeItemEditavel(refeicao, item)));

  const add = document.createElement('button');
  add.className = 'btn btn-primario btn-bloco';
  add.style.marginTop = '12px';
  add.textContent = '+ item';
  add.onclick = () => adicionarItem(refeicao);
  raiz.appendChild(add);
}

/** Um item da refeição, com o que dá para editar nele. */
function cardDeItemEditavel(refeicao, item) {
  const card = document.createElement('div');
  card.className = 'card';

  const cab = document.createElement('div');
  cab.className = 'card-cabecalho';
  const h3 = document.createElement('h3');
  h3.textContent = item.nome;
  cab.appendChild(h3);

  if (item.livre) {
    const etq = document.createElement('span');
    etq.className = 'etiqueta';
    etq.textContent = 'sem valores';
    etq.title = 'Item livre não entra nos cálculos';
    cab.appendChild(etq);
  }

  if (item.tipo === TIPO_ITEM.GRUPO) {
    const renomear = document.createElement('button');
    renomear.className = 'btn btn-icone';
    renomear.textContent = '✎';
    renomear.setAttribute('aria-label', 'Renomear grupo');
    renomear.onclick = async () => {
      const dados = await formulario('Renomear grupo', [
        { nome: 'nome', rotulo: 'Nome do grupo', valor: item.nome },
      ]);
      if (!dados || !dados.nome.trim()) return;
      await dieta.renomearGrupo(refeicao.id, item.itemId, dados.nome);
      await recarregar();
    };
    cab.appendChild(renomear);
  }

  const remover = document.createElement('button');
  remover.className = 'btn btn-icone';
  remover.textContent = '×';
  remover.setAttribute('aria-label', 'Remover item');
  remover.onclick = async () => {
    const ok = await confirmar(
      'Remover ' + item.nome + '?',
      item.tipo === TIPO_ITEM.GRUPO
        ? 'O grupo inteiro sai desta refeição, com todas as opções dele.'
        : 'Sai desta refeição.',
      'Remover'
    );
    if (!ok) return;
    await dieta.removerItem(refeicao.id, item.itemId);
    await recarregar();
  };
  cab.appendChild(remover);
  card.appendChild(cab);

  if (item.tipo === TIPO_ITEM.GRUPO) {
    card.appendChild(
      textoFraco(
        'Uma linha por opção. A marcada é a padrão; toque nela para trocar, ou no ⋯ para mudar a quantidade e remover.',
        '0 0 8px'
      )
    );

    item.opcoes.forEach((o) => card.appendChild(linhaDeOpcao(refeicao, item, o)));

    const add = document.createElement('button');
    add.className = 'btn btn-bloco';
    add.style.marginTop = '10px';
    add.textContent = '+ opção';
    add.onclick = () => adicionarOpcao(refeicao, item);
    card.appendChild(add);

    card.appendChild(
      textoFraco(
        `Faixa do grupo: ${num(item.minimo.kcal, 0)} a ${num(item.maximo.kcal, 0)} kcal · proteína de ${num(item.minimo.proteina, 1)} a ${num(item.maximo.proteina, 1)} g.`,
        '10px 0 0'
      )
    );
    return card;
  }

  if (item.livre) return card;

  const linha = document.createElement('div');
  linha.className = 'linha-botoes';

  const quantidade = document.createElement('button');
  quantidade.className = 'btn btn-pequeno';
  quantidade.textContent = item.descricao;
  quantidade.onclick = async () => {
    const ehPrato = item.tipo === TIPO_ITEM.PRATO;
    const dados = await formulario(item.nome, [
      {
        nome: 'q',
        rotulo: ehPrato ? 'Porções (1 = o prato inteiro)' : 'Quantidade',
        tipo: 'number',
        valor: '',
      },
    ]);
    if (!dados) return;
    await dieta.alterarQuantidade(refeicao.id, item.itemId, paraNumero(dados.q));
    await recarregar();
  };
  linha.appendChild(quantidade);

  const kcal = document.createElement('span');
  kcal.className = 'texto-fraco pequeno';
  kcal.style.alignSelf = 'center';
  kcal.textContent = `${num(item.valores.kcal, 0)} kcal · P ${num(item.valores.proteina, 1)} g`;
  linha.appendChild(kcal);

  card.appendChild(linha);

  if (item.erro) {
    const erro = document.createElement('p');
    erro.className = 'pequeno';
    erro.style.color = 'var(--piora)';
    erro.style.margin = '6px 0 0';
    erro.textContent = item.erro;
    card.appendChild(erro);
  }

  return card;
}

/**
 * Uma opção dentro de um grupo, na tela de edição.
 * @param {Object} refeicao
 * @param {Object} item o grupo
 * @param {Object} opcao
 * @returns {HTMLElement}
 */
function linhaDeOpcao(refeicao, item, opcao) {
  const linha = document.createElement('div');
  linha.className = 'linha-opcao';
  if (opcao.padrao) linha.classList.add('padrao');

  const marcar = document.createElement('button');
  marcar.className = 'linha-opcao-escolher';
  marcar.setAttribute('aria-pressed', String(opcao.padrao));
  marcar.title = opcao.padrao ? 'Esta é a opção padrão' : 'Tornar esta a opção padrão';

  const nome = document.createElement('span');
  nome.className = 'linha-opcao-nome';
  nome.textContent = opcao.nome;
  marcar.appendChild(nome);

  const detalhe = document.createElement('span');
  detalhe.className = 'linha-opcao-detalhe';
  const q = document.createElement('strong');
  q.textContent = opcao.descricao;
  detalhe.appendChild(q);
  const valores = document.createElement('span');
  valores.textContent =
    `${num(opcao.valores.kcal, 0)} kcal · P ${num(opcao.valores.proteina, 1)} g · ` +
    `G ${num(opcao.valores.gordura, 1)} g · C ${num(opcao.valores.carbo, 1)} g`;
  detalhe.appendChild(valores);
  marcar.appendChild(detalhe);

  marcar.onclick = async () => {
    if (opcao.padrao) return;
    await dieta.escolherOpcao(refeicao.id, item.itemId, opcao.opcaoId);
    await recarregar();
  };
  linha.appendChild(marcar);

  const menu = document.createElement('button');
  menu.className = 'btn btn-icone';
  menu.textContent = '⋯';
  menu.setAttribute('aria-label', 'Opções');
  menu.onclick = async () => {
    const acao = await escolher(opcao.nome, [
      { valor: 'quantidade', rotulo: 'Mudar a quantidade', detalhe: opcao.descricao },
      { valor: 'padrao', rotulo: 'Tornar a opção padrão' },
      { valor: 'remover', rotulo: 'Remover do grupo' },
    ]);

    if (acao === 'quantidade') {
      const dados = await formulario(opcao.nome, [
        { nome: 'q', rotulo: 'Quantidade', tipo: 'number', valor: '' },
      ]);
      if (!dados) return;
      await dieta.alterarQuantidadeDaOpcao(
        refeicao.id,
        item.itemId,
        opcao.opcaoId,
        paraNumero(dados.q)
      );
      return recarregar();
    }

    if (acao === 'padrao') {
      await dieta.escolherOpcao(refeicao.id, item.itemId, opcao.opcaoId);
      return recarregar();
    }

    if (acao === 'remover') {
      if (item.opcoes.length <= 1) {
        await avisar(
          'Última opção',
          'Um grupo precisa de pelo menos uma opção. Remova o grupo inteiro pelo × do cabeçalho.'
        );
        return;
      }
      const ok = await confirmar(
        'Remover ' + opcao.nome + '?',
        'Sai deste grupo de opções. O alimento continua no índice.',
        'Remover'
      );
      if (!ok) return;
      await dieta.removerOpcao(refeicao.id, item.itemId, opcao.opcaoId);
      return recarregar();
    }
  };
  linha.appendChild(menu);

  return linha;
}

/**
 * Acrescenta uma opção a um grupo existente.
 * @param {Object} refeicao
 * @param {Object} item
 */
async function adicionarOpcao(refeicao, item) {
  const tipo = await escolher('Nova opção de ' + item.nome, [
    { valor: TIPO_ITEM.ALIMENTO, rotulo: 'Um alimento do índice' },
    { valor: TIPO_ITEM.PRATO, rotulo: 'Um prato composto' },
  ]);
  if (!tipo) return;

  const opcao = await montarOpcao(tipo);
  if (!opcao) return;

  await dieta.adicionarOpcao(refeicao.id, item.itemId, opcao);
  await recarregar();
}

/**
 * Pergunta alimento/prato e quantidade, devolvendo a opção pronta.
 * @param {string} tipo
 * @returns {Promise<Object|null>}
 */
async function montarOpcao(tipo) {
  if (tipo === TIPO_ITEM.PRATO) {
    const pratos = await dieta.listarPratos();
    if (!pratos.length) {
      await avisar('Nenhum prato', 'Crie um prato composto primeiro, na tela Pratos.');
      return null;
    }
    const pratoId = await escolherComBusca(
      'Escolher prato',
      pratos.map((p) => ({ valor: p.id, rotulo: p.nome }))
    );
    if (!pratoId) return null;
    const dados = await formulario('Porções', [
      { nome: 'q', rotulo: 'Porções (1 = o prato inteiro)', tipo: 'number', valor: 1 },
    ]);
    if (!dados) return null;
    return { tipo: TIPO_ITEM.PRATO, pratoId, porcoes: paraNumero(dados.q) ?? 1 };
  }

  const alimentoId = await escolherAlimento('Escolher alimento');
  if (!alimentoId) return null;
  const alimento = await dieta.buscarAlimento(alimentoId);
  const dados = await formulario(alimento.nome, [
    { nome: 'q', rotulo: `Quantidade (${alimento.unidade})`, tipo: 'number', valor: '' },
  ]);
  if (!dados) return null;
  return { tipo: TIPO_ITEM.ALIMENTO, alimentoId, quantidade: paraNumero(dados.q) };
}

/** Adiciona um item à refeição. */
async function adicionarItem(refeicao) {
  const tipo = await escolher('O que adicionar?', [
    { valor: TIPO_ITEM.ALIMENTO, rotulo: 'Um alimento do índice' },
    { valor: TIPO_ITEM.PRATO, rotulo: 'Um prato composto' },
    { valor: TIPO_ITEM.GRUPO, rotulo: 'Grupo de opções', detalhe: 'ex.: Carboidrato' },
    { valor: TIPO_ITEM.LIVRE, rotulo: 'Item livre', detalhe: 'sem valores' },
  ]);
  if (!tipo) return;

  if (tipo === TIPO_ITEM.GRUPO) {
    const nome = await formulario(
      'Novo grupo de opções',
      [
        {
          nome: 'nome',
          rotulo: 'Nome do grupo',
          placeholder: 'Carboidrato',
          dica: 'Um grupo guarda alternativas para a mesma função na refeição. A opção padrão é a que entra no total do dia.',
        },
      ],
      'Criar'
    );
    if (!nome || !nome.nome.trim()) return;

    const tipoDaPrimeira = await escolher('Primeira opção do grupo', [
      { valor: TIPO_ITEM.ALIMENTO, rotulo: 'Um alimento do índice' },
      { valor: TIPO_ITEM.PRATO, rotulo: 'Um prato composto' },
    ]);
    if (!tipoDaPrimeira) return;

    const primeira = await montarOpcao(tipoDaPrimeira);
    if (!primeira) return;

    const id = 'op-' + Math.random().toString(36).slice(2, 10);
    await dieta.adicionarItem(refeicao.id, {
      tipo: TIPO_ITEM.GRUPO,
      nome: nome.nome.trim(),
      opcoes: [{ id, ...primeira }],
      padraoId: id,
    });
    await recarregar();
    return;
  }

  if (tipo === TIPO_ITEM.LIVRE) {
    const dados = await formulario('Item livre', [
      { nome: 'texto', rotulo: 'Texto', placeholder: 'Salada à vontade' },
    ]);
    if (!dados || !dados.texto.trim()) return;
    await dieta.adicionarItem(refeicao.id, { tipo: TIPO_ITEM.LIVRE, texto: dados.texto.trim() });
    await recarregar();
    return;
  }

  if (tipo === TIPO_ITEM.PRATO) {
    const pratos = await dieta.listarPratos();
    if (!pratos.length) {
      await avisar('Nenhum prato', 'Crie um prato composto primeiro, na tela Pratos.');
      return;
    }
    const pratoId = await escolherComBusca(
      'Escolher prato',
      pratos.map((p) => ({ valor: p.id, rotulo: p.nome }))
    );
    if (!pratoId) return;
    const dados = await formulario('Porções', [
      { nome: 'q', rotulo: 'Porções (1 = o prato inteiro)', tipo: 'number', valor: 1 },
    ]);
    if (!dados) return;
    await dieta.adicionarItem(refeicao.id, {
      tipo: TIPO_ITEM.PRATO,
      pratoId,
      porcoes: paraNumero(dados.q) ?? 1,
    });
    await recarregar();
    return;
  }

  const alimentoId = await escolherAlimento('Escolher alimento');
  if (!alimentoId) return;
  const alimento = await dieta.buscarAlimento(alimentoId);
  const dados = await formulario(alimento.nome, [
    { nome: 'q', rotulo: `Quantidade (${alimento.unidade})`, tipo: 'number', valor: '' },
  ]);
  if (!dados) return;
  await dieta.adicionarItem(refeicao.id, {
    tipo: TIPO_ITEM.ALIMENTO,
    alimentoId,
    quantidade: paraNumero(dados.q),
  });
  await recarregar();
}

/**
 * Abre a busca de alimentos do índice.
 * @param {string} titulo
 * @returns {Promise<string|null>}
 */
async function escolherAlimento(titulo) {
  const lista = await dieta.listarAlimentos();
  if (!lista.length) {
    await avisar('Índice vazio', 'Cadastre alimentos primeiro.');
    return null;
  }
  return escolherComBusca(
    titulo,
    lista.map((a) => ({
      valor: a.id,
      rotulo: a.nome,
      detalhe: `${num(a.kcal, 0)} kcal/${num(a.quantidadeRef, 0)}${a.unidade}`,
    }))
  );
}
