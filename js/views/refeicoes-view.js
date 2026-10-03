/** Plano (as refeições, em ordem) e refeição (itens, grupos de opções e quantidades). */

import * as dieta from '../services/dieta-service.js';
import { TIPO_ITEM } from '../domain/nutricao.js';
import { num, paraNumero } from '../utils/format.js';
import { confirmar, escolher, escolherComBusca, formulario, avisar } from '../components/dialogo.js';
import { blocoVazio, textoFraco } from '../components/ui.js';
import { abrir, definirTitulo, voltarUmaTela, recarregar } from '../navegacao.js';
import { escolherAlimento } from './dieta-comum.js';

/**
 * Tela de um plano: as refeições, na ordem.
 * @param {HTMLElement} raiz
 * @param {{planoId: string}} params
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

  const totais = document.createElement('div');
  totais.className = 'card card-sugestao';
  const h2 = document.createElement('h2');
  h2.classList.add('m-0', 'mb-1');
  h2.textContent = `${num(dia.total.kcal, 0)} kcal`;
  totais.appendChild(h2);
  totais.appendChild(
    textoFraco(
      dia.metas.kcal
        ? `Meta: ${num(dia.metas.kcal, 0)} kcal`
        : 'Sem meta de calorias definida.',
      'm-0'
    )
  );

  const renomear = document.createElement('button');
  renomear.className = 'btn btn-bloco mt-3';
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
  adicionar.className = 'btn btn-primario btn-bloco mt-3';
  adicionar.textContent = '+ refeição';
  adicionar.onclick = () => adicionarRefeicao(plano);
  raiz.appendChild(adicionar);
}

/**
 * Card de uma refeição no plano.
 * @param {Object} plano
 * @param {Object} r refeição calculada
 * @param {number} indice posição
 * @param {number} total quantas refeições o plano tem
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
  resumo.className = 'texto-fraco pequeno m-0';
  const kcal = `${num(r.total.kcal, 0)} kcal`;
  resumo.textContent =
    `${r.itens.length} ${r.itens.length === 1 ? 'item' : 'itens'} · ${kcal} · ` +
    `P ${num(r.total.proteina, 1)} g`;
  card.appendChild(resumo);

  card.onclick = () => abrir('refeicao', { refeicaoId: r.refeicaoId });
  return card;
}

/** Seta para subir ou descer a refeição. */
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

/** Menu de uma refeição no plano. */
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

/** Cria uma refeição nova ou usa uma que já existe. */
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

/* --- Refeição --- */

/**
 * Tela de uma refeição.
 * @param {HTMLElement} raiz
 * @param {{refeicaoId: string}} params
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
  h2.textContent = `${num(calculo.total.kcal, 0)} kcal`;
  h2.classList.add('m-0', 'mb-1');
  totais.appendChild(h2);
  const macros = document.createElement('p');
  macros.className = 'texto-fraco pequeno m-0';
  macros.textContent =
    `P ${num(calculo.total.proteina, 1)} g · ` +
    `G ${num(calculo.total.gordura, 1)} g · C ${num(calculo.total.carbo, 1)} g`;
  totais.appendChild(macros);
  raiz.appendChild(totais);

  calculo.itens.forEach((item) => raiz.appendChild(cardDeItemEditavel(refeicao, item)));

  const add = document.createElement('button');
  add.className = 'btn btn-primario btn-bloco mt-3';
  add.textContent = '+ item';
  add.onclick = () => adicionarItem(refeicao);
  raiz.appendChild(add);
}

/** Card de um item editável. */
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
        'm-0',
        'mb-2'
      )
    );

    item.opcoes.forEach((o) => card.appendChild(linhaDeOpcao(refeicao, item, o)));

    const add = document.createElement('button');
    add.className = 'btn btn-bloco mt-3';
    add.textContent = '+ opção';
    add.onclick = () => adicionarOpcao(refeicao, item);
    card.appendChild(add);
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
  kcal.className = 'texto-fraco pequeno alinha-centro';
  kcal.textContent = `${num(item.valores.kcal, 0)} kcal · P ${num(item.valores.proteina, 1)} g`;
  linha.appendChild(kcal);

  card.appendChild(linha);

  if (item.erro) {
    const erro = document.createElement('p');
    erro.className = 'pequeno texto-erro';
    erro.classList.add('m-0', 'mt-2');
    erro.textContent = item.erro;
    card.appendChild(erro);
  }

  return card;
}

/**
 * Linha de uma opção do grupo.
 * @param {Object} refeicao
 * @param {Object} item o grupo
 * @param {Object} opcao
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

/** Acrescenta uma opção ao grupo. */
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

/** Pede alimento ou prato e a quantidade. Devolve a opção ou null. */
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

/** Acrescenta um item à refeição. */
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
