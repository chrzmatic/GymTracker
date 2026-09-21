/**
 * Aba Dieta: o plano de hoje, com os totais calculados.
 *
 * O plano não é um registro do que você comeu: é o que você segue. Por
 * isso não há "marcar como comido" — há o plano, os valores dele e a
 * comparação com a meta.
 *
 * Nada aqui guarda kcal: tudo é calculado a partir do índice na hora de
 * desenhar. Corrigir um valor no índice muda o dia inteiro na hora.
 */

import * as dieta from '../services/dieta-service.js';
import { hojeIso, formatarLongo } from '../utils/date.js';
import { num, comSinal, paraNumero } from '../utils/format.js';
import { escolher, formulario } from '../components/dialogo.js';
import { abrir } from '../navegacao.js';

/** Estado da tela. */
const estado = { data: null, planoId: null };

let raiz = null;

/** Rótulos e unidades dos nutrientes, na ordem de exibição. */
const NUTRIENTES = [
  { id: 'kcal', rotulo: 'Calorias', unidade: 'kcal', casas: 0 },
  { id: 'proteina', rotulo: 'Proteína', unidade: 'g', casas: 1 },
  { id: 'gordura', rotulo: 'Gordura', unidade: 'g', casas: 1 },
  { id: 'carbo', rotulo: 'Carboidrato', unidade: 'g', casas: 1 },
  { id: 'fibra', rotulo: 'Fibra', unidade: 'g', casas: 1 },
];

/**
 * Renderiza a aba Dieta.
 * @param {HTMLElement} elemento
 * @param {{data?: string}} [params]
 * @returns {Promise<void>}
 */
export async function montarDieta(elemento, params = {}) {
  raiz = elemento;
  estado.data = params.data ?? hojeIso();
  await desenhar();
}

/** Relê o plano do dia e redesenha. */
async function desenhar() {
  raiz.innerHTML = '';

  const { plano, automatico, treinou } = await dieta.planoDoDia(estado.data);
  if (!plano) {
    raiz.innerHTML = '<div class="vazio">Nenhum plano de dieta cadastrado.</div>';
    raiz.appendChild(atalhos());
    return;
  }

  estado.planoId = plano.id;
  const dia = await dieta.calcularDia(plano.id);

  raiz.appendChild(cabecalho(plano, automatico, treinou));
  raiz.appendChild(cardDeTotais(dia));

  dia.refeicoes.forEach((r) => raiz.appendChild(cardDeRefeicao(r)));

  if (dia.erros.length) raiz.appendChild(faixaDeErros(dia.erros));
  if (dia.incompleto) raiz.appendChild(faixaIncompleta());

  raiz.appendChild(atalhos());
}

/* ------------------------------------------------------------------ */
/* Cabeçalho: qual plano e por quê                                     */
/* ------------------------------------------------------------------ */

function cabecalho(plano, automatico, treinou) {
  const card = document.createElement('div');
  card.className = 'card';

  const cab = document.createElement('div');
  cab.className = 'card-cabecalho';
  const h3 = document.createElement('h3');
  h3.textContent = plano.nome;
  cab.appendChild(h3);

  const etq = document.createElement('span');
  etq.className = 'etiqueta';
  etq.textContent = automatico ? 'automático' : 'escolhido por você';
  if (!automatico) etq.classList.add('etiqueta-acento');
  cab.appendChild(etq);
  card.appendChild(cab);

  const porque = document.createElement('p');
  porque.className = 'texto-fraco pequeno';
  porque.style.margin = '0 0 10px';
  porque.textContent = automatico
    ? treinou
      ? `${formatarLongo(estado.data)} · há treino registrado hoje, então vale o plano de dia de treino.`
      : `${formatarLongo(estado.data)} · nenhum treino registrado hoje. Se for treinar, troque abaixo.`
    : `${formatarLongo(estado.data)} · você fixou este plano para hoje.`;
  card.appendChild(porque);

  const botoes = document.createElement('div');
  botoes.className = 'linha-botoes';

  const editar = document.createElement('button');
  editar.className = 'btn';
  editar.textContent = 'Editar refeições';
  editar.onclick = () => abrir('plano-editor', { planoId: plano.id });
  botoes.appendChild(editar);

  const trocar = document.createElement('button');
  trocar.className = 'btn';
  trocar.textContent = 'Trocar o plano';
  trocar.onclick = async () => {
    const planos = await dieta.listarPlanos();
    const opcoes = planos.map((p) => ({
      valor: p.id,
      rotulo: p.nome,
      detalhe: p.id === plano.id ? 'atual' : '',
    }));
    if (!automatico) opcoes.push({ valor: '__auto', rotulo: 'Decidir automaticamente' });

    const escolha = await escolher('Plano de ' + formatarLongo(estado.data), opcoes);
    if (!escolha) return;

    if (escolha === '__auto') await dieta.voltarAoAutomatico(estado.data);
    else await dieta.escolherPlanoDoDia(estado.data, escolha);
    await desenhar();
  };
  botoes.appendChild(trocar);
  card.appendChild(botoes);

  return card;
}

/* ------------------------------------------------------------------ */
/* Totais do dia                                                       */
/* ------------------------------------------------------------------ */

function cardDeTotais(dia) {
  const card = document.createElement('div');
  card.className = 'card card-sugestao';

  const h2 = document.createElement('h2');
  h2.textContent = num(dia.total.kcal, 0) + ' kcal';
  h2.style.margin = '0 0 2px';
  card.appendChild(h2);

  if (dia.varia) {
    const faixa = document.createElement('p');
    faixa.className = 'texto-fraco pequeno';
    faixa.style.margin = '0 0 10px';
    faixa.textContent = `Com as trocas possíveis: de ${num(dia.minimo.kcal, 0)} a ${num(dia.maximo.kcal, 0)} kcal.`;
    card.appendChild(faixa);
  }

  const cabecalhoTabela = document.createElement('div');
  cabecalhoTabela.className = 'metrica metrica-cabecalho';
  ['', 'Dia', 'Meta', 'Dif.'].forEach((texto, i) => {
    const span = document.createElement('span');
    span.className = i === 0 ? 'metrica-rotulo' : i === 3 ? 'metrica-dif' : 'metrica-valor';
    span.textContent = texto;
    cabecalhoTabela.appendChild(span);
  });
  card.appendChild(cabecalhoTabela);

  NUTRIENTES.forEach((n) => {
    const d = dia.diferencas[n.id];
    const linha = document.createElement('div');
    linha.className = 'metrica';

    const rotulo = document.createElement('span');
    rotulo.className = 'metrica-rotulo';
    rotulo.textContent = n.rotulo;
    linha.appendChild(rotulo);

    const valor = document.createElement('span');
    valor.className = 'metrica-valor';
    valor.textContent = num(dia.total[n.id], n.casas);
    linha.appendChild(valor);

    const meta = document.createElement('span');
    meta.className = 'metrica-valor';
    meta.textContent = d ? num(d.meta, n.casas) : '—';
    linha.appendChild(meta);

    const dif = document.createElement('span');
    dif.className = 'metrica-dif';
    if (d) {
      // Perto da meta é cinza; longe, laranja. Não uso verde/vermelho
      // porque em dieta "mais" não é melhor nem pior por si só.
      const longe = d.percentual !== null && Math.abs(d.percentual - 100) > 10;
      dif.classList.add(longe ? 'piora' : 'igual');
      dif.textContent = comSinal(d.diferenca, n.casas);
    } else {
      dif.textContent = '—';
    }
    linha.appendChild(dif);

    card.appendChild(linha);
  });

  const metas = document.createElement('button');
  metas.className = 'btn btn-bloco';
  metas.style.marginTop = '10px';
  metas.textContent = 'Editar metas deste plano';
  metas.onclick = () => editarMetas(dia);
  card.appendChild(metas);

  return card;
}

/** Formulário de metas do plano. */
async function editarMetas(dia) {
  const dados = await formulario(
    'Metas — ' + dia.nome,
    [
      { nome: 'kcal', rotulo: 'Meta de calorias (kcal)', tipo: 'number', valor: dia.metas.kcal ?? '' },
      { nome: 'proteina', rotulo: 'Proteína (g)', tipo: 'number', valor: dia.metas.proteina ?? '' },
      { nome: 'gordura', rotulo: 'Gordura (g)', tipo: 'number', valor: dia.metas.gordura ?? '' },
      {
        nome: 'carbo',
        rotulo: 'Carboidrato (g)',
        tipo: 'number',
        valor: dia.metas.carbo ?? '',
        dica: 'Deixe em branco o que não quiser acompanhar — em branco significa "sem meta", não zero.',
      },
    ],
    'Salvar'
  );
  if (!dados) return;

  await dieta.salvarMetas(estado.planoId, {
    kcal: paraNumero(dados.kcal),
    proteina: paraNumero(dados.proteina),
    gordura: paraNumero(dados.gordura),
    carbo: paraNumero(dados.carbo),
  });
  await desenhar();
}

/* ------------------------------------------------------------------ */
/* Refeições                                                           */
/* ------------------------------------------------------------------ */

function cardDeRefeicao(r) {
  const card = document.createElement('div');
  card.className = 'card';

  const cab = document.createElement('div');
  cab.className = 'card-cabecalho';
  const h3 = document.createElement('h3');
  h3.textContent = r.nome;
  cab.appendChild(h3);

  const kcal = document.createElement('span');
  kcal.className = 'refeicao-kcal';
  kcal.textContent = r.varia
    ? `${num(r.minimo.kcal, 0)}–${num(r.maximo.kcal, 0)} kcal`
    : `${num(r.total.kcal, 0)} kcal`;
  cab.appendChild(kcal);

  const menu = document.createElement('button');
  menu.className = 'btn btn-icone';
  menu.textContent = '⋯';
  menu.setAttribute('aria-label', 'Editar refeição');
  menu.onclick = () => abrir('refeicao', { refeicaoId: r.refeicaoId });
  cab.appendChild(menu);
  card.appendChild(cab);

  r.itens.forEach((item) => card.appendChild(linhaDeItem(r, item)));
  card.appendChild(resumoDeMacros(r.total));

  return card;
}

/**
 * Resumo de macros da refeição.
 *
 * Antes era uma linha de texto corrido em cinza pequeno ("P 43,2 g · G
 * 34,2 g · C 57,7 g"), que some do olhar. Como são os números que decidem
 * se a refeição está boa, viraram blocos com rótulo por extenso e valor em
 * destaque.
 *
 * @param {Object} total
 * @returns {HTMLElement}
 */
function resumoDeMacros(total) {
  const div = document.createElement('div');
  div.className = 'resumo-macros';

  [
    ['Proteína', total.proteina],
    ['Gordura', total.gordura],
    ['Carbo', total.carbo],
    ['Fibra', total.fibra],
  ].forEach(([rotulo, valor]) => {
    const bloco = document.createElement('div');
    bloco.className = 'macro';

    const nome = document.createElement('span');
    nome.className = 'macro-rotulo';
    nome.textContent = rotulo;
    bloco.appendChild(nome);

    const v = document.createElement('strong');
    v.className = 'macro-valor';
    v.textContent = num(valor, 1) + ' g';
    bloco.appendChild(v);

    div.appendChild(bloco);
  });

  return div;
}

/**
 * Uma linha de item dentro da refeição.
 *
 * A quantidade é o dado mais importante da tela: é por ela que se monta o
 * prato na cozinha. Por isso ela vem numa coluna própria, com o mesmo
 * destaque do nome — e não colada nele nem escondida junto das calorias.
 */
function linhaDeItem(refeicao, item) {
  const div = document.createElement('div');
  div.className = 'item-dieta';

  if (item.tipo === 'grupo') {
    const titulo = document.createElement('div');
    titulo.className = 'item-dieta-grupo';
    titulo.textContent = item.nome;
    div.appendChild(titulo);

    const pilulas = document.createElement('div');
    pilulas.className = 'pilulas';
    item.opcoes.forEach((o) => pilulas.appendChild(pilulaDeOpcao(o, refeicao, item)));
    div.appendChild(pilulas);
    return div;
  }

  // Item livre não tem valores, então não vale abrir nada nele; os outros
  // abrem a tela com a informação nutricional daquela quantidade.
  const linha = document.createElement(item.livre ? 'div' : 'button');
  linha.className = 'item-dieta-linha';
  if (!item.livre) {
    linha.classList.add('item-dieta-clicavel');
    linha.onclick = () =>
      abrir('nutricional', { refeicaoId: refeicao.refeicaoId, itemId: item.itemId });
  }

  const nome = document.createElement('span');
  nome.className = 'item-dieta-nome';
  nome.textContent = item.nome;
  if (item.livre) nome.classList.add('texto-fraco');
  linha.appendChild(nome);

  if (!item.livre) {
    const quantidade = document.createElement('span');
    quantidade.className = 'item-dieta-quantidade';
    quantidade.textContent = item.descricao;
    linha.appendChild(quantidade);

    const kcal = document.createElement('span');
    kcal.className = 'item-dieta-kcal';
    kcal.textContent = num(item.valores.kcal, 0) + ' kcal';
    linha.appendChild(kcal);
  }

  div.appendChild(linha);

  if (item.erro) {
    const erro = document.createElement('p');
    erro.className = 'pequeno';
    erro.style.color = 'var(--piora)';
    erro.style.margin = '2px 0 0';
    erro.textContent = item.erro;
    div.appendChild(erro);
  }

  return div;
}

/**
 * Pílula de uma opção de grupo, em duas linhas.
 *
 * A quantidade fica em destaque na segunda linha porque escolher entre
 * "200 g de arroz" e "180 g de massa" é uma decisão sobre a quantidade
 * tanto quanto sobre o alimento.
 *
 * @param {Object} opcao
 * @param {Object} refeicao
 * @param {Object} item
 * @returns {HTMLElement}
 */
function pilulaDeOpcao(opcao, refeicao, item) {
  const btn = document.createElement('button');
  btn.className = 'pilula pilula-opcao';
  btn.setAttribute('aria-pressed', String(opcao.padrao));

  const nome = document.createElement('span');
  nome.className = 'pilula-opcao-nome';
  nome.textContent = opcao.nome;
  btn.appendChild(nome);

  const detalhe = document.createElement('span');
  detalhe.className = 'pilula-opcao-detalhe';

  const quantidade = document.createElement('strong');
  quantidade.className = 'pilula-opcao-quantidade';
  quantidade.textContent = opcao.descricao;
  detalhe.appendChild(quantidade);

  const kcal = document.createElement('span');
  kcal.textContent = `${num(opcao.valores.kcal, 0)} kcal · P ${num(opcao.valores.proteina, 1)} g`;
  detalhe.appendChild(kcal);

  btn.appendChild(detalhe);

  btn.onclick = async () => {
    await dieta.escolherOpcao(refeicao.refeicaoId, item.itemId, opcao.opcaoId);
    await desenhar();
  };
  return btn;
}

/* ------------------------------------------------------------------ */
/* Avisos e atalhos                                                    */
/* ------------------------------------------------------------------ */

function faixaDeErros(erros) {
  const div = document.createElement('div');
  div.className = 'faixa-aviso';
  div.style.borderColor = 'var(--piora)';
  div.style.color = 'var(--piora)';
  div.textContent =
    erros.length === 1
      ? `${erros[0].refeicao}: ${erros[0].erro}`
      : `${erros.length} itens com problema: ${erros.map((e) => e.nome).join(', ')}.`;
  return div;
}

function faixaIncompleta() {
  const div = document.createElement('div');
  div.className = 'faixa-aviso';
  div.textContent =
    'Alguns itens têm valores em branco no índice (ou quantidade não preenchida). Eles contam como zero, então o total do dia está subestimado.';
  return div;
}

function atalhos() {
  const div = document.createElement('div');
  div.className = 'linha-botoes';
  div.style.marginTop = '20px';

  const alimentos = document.createElement('button');
  alimentos.className = 'btn';
  alimentos.textContent = 'Alimentos';
  alimentos.onclick = () => abrir('alimentos');

  const pratos = document.createElement('button');
  pratos.className = 'btn';
  pratos.textContent = 'Pratos';
  pratos.onclick = () => abrir('pratos');

  div.append(alimentos, pratos);
  return div;
}
