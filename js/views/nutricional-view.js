/** Informação nutricional de um item do plano. */

import * as dieta from '../services/dieta-service.js';
import { TIPO_ITEM, INFO_NUTRIENTES, calcularPrato, calcularItem, calcularOpcao } from '../domain/nutricao.js';
import { num, paraNumero } from '../utils/format.js';
import { formulario } from '../components/dialogo.js';
import { textoFraco } from '../components/ui.js';
import { abrir, definirTitulo, voltarUmaTela, recarregar } from '../navegacao.js';

/**
 * Um item do plano: o que ele dá na quantidade planejada e o valor
 * de referência do índice.
 * @param {HTMLElement} raiz
 * @param {{refeicaoId: string, itemId: string, opcaoId?: string}} params
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

  /* --- na quantidade do plano --- */
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

  /* --- referência do índice --- */
  const referencia = document.createElement('div');
  referencia.className = 'card';

  const titulo = document.createElement('h3');
  titulo.style.margin = '0 0 8px';
  titulo.textContent = ehPrato
    ? 'O prato inteiro (1 porção)'
    : `Por ${num(fonte.quantidadeRef, 2)} ${fonte.unidade}`;
  referencia.appendChild(titulo);

  if (ehPrato) {
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

/** Valores de referência do alimento. */
function valoresDoAlimento(alimento) {
  return {
    kcal: alimento.kcal,
    proteina: alimento.proteina,
    gordura: alimento.gordura,
    carbo: alimento.carbo,
    fibra: alimento.fibra,
  };
}

/** Tabela de nutrientes. Valor ausente aparece como "— em branco". */
function tabelaDeNutrientes(valores) {
  const div = document.createElement('div');

  INFO_NUTRIENTES.forEach(({ id: chave, rotulo, unidade, casas }) => {
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
