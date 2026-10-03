/**
 * Resumo de uma sessão, só leitura, bom para print.
 * Relê o banco a cada desenho, então reflete as edições.
 */

import { carregarSessao } from '../services/sessao-service.js';
import {
  resumirSessao,
  textoParaCopiar,
  textoDosTotais,
} from '../domain/resumo-sessao.js';
import { formatarLongo, descreverDistancia } from '../utils/date.js';
import { copiarTexto } from '../components/copiar.js';
import { formulario } from '../components/dialogo.js';
import { abrir, definirTitulo, voltarUmaTela } from '../navegacao.js';

/**
 * Monta o resumo.
 * @param {HTMLElement} raiz
 * @param {{sessaoId: string}} params
 */
export async function montarResumoDaSessao(raiz, params = {}) {
  const carregada = params.sessaoId ? await carregarSessao(params.sessaoId) : null;
  if (!carregada) {
    // A sessão foi excluída.
    await voltarUmaTela();
    return;
  }

  const resumo = resumirSessao(carregada);
  definirTitulo('Treino ' + resumo.treinoNome);
  raiz.innerHTML = '';

  raiz.appendChild(cabecalho(resumo));

  const card = document.createElement('div');
  card.className = 'card resumo-sessao';
  if (!resumo.exercicios.length) {
    const vazio = document.createElement('p');
    vazio.className = 'texto-fraco m-0';
    vazio.textContent = 'Nenhum exercício nesta sessão.';
    card.appendChild(vazio);
  }
  resumo.exercicios.forEach((e) => card.appendChild(blocoDoExercicio(e)));
  raiz.appendChild(card);

  if (resumo.anotacao) {
    const nota = document.createElement('div');
    nota.className = 'card resumo-anotacao';
    nota.textContent = resumo.anotacao;
    raiz.appendChild(nota);
  }

  raiz.appendChild(botoes(resumo));
}

/** Nome do treino, data e totais. */
function cabecalho(resumo) {
  const div = document.createElement('div');
  div.className = 'resumo-cabecalho';

  const linha = document.createElement('div');
  linha.className = 'resumo-titulo';
  if (resumo.cor) {
    const marca = document.createElement('span');
    marca.className = 'marca-treino';
    marca.style.background = resumo.cor;
    linha.appendChild(marca);
  }
  const h2 = document.createElement('h2');
  h2.classList.add('m-0');
  h2.textContent = 'Treino ' + resumo.treinoNome;
  linha.appendChild(h2);
  if (!resumo.finalizada) {
    const etq = document.createElement('span');
    etq.className = 'etiqueta etiqueta-acento';
    etq.textContent = 'em andamento';
    linha.appendChild(etq);
  }
  div.appendChild(linha);

  const data = document.createElement('p');
  data.className = 'texto-fraco pequeno m-0 mt-1';
  data.textContent = `${formatarLongo(resumo.data)} · ${descreverDistancia(resumo.data)}`;
  div.appendChild(data);

  const totais = document.createElement('p');
  totais.className = 'texto-fraco pequeno m-0';
  totais.textContent = textoDosTotais(resumo.totais);
  div.appendChild(totais);

  return div;
}

/** Um exercício com as séries em pílulas. */
function blocoDoExercicio(e) {
  const bloco = document.createElement('div');
  bloco.className = 'resumo-exercicio';

  const nome = document.createElement('div');
  nome.className = 'resumo-exercicio-nome';
  const posicao = document.createElement('span');
  posicao.className = 'texto-fraco';
  posicao.textContent = `${e.posicao}. `;
  nome.append(posicao, document.createTextNode(e.nome));
  if (e.opcional) {
    const etq = document.createElement('span');
    etq.className = 'etiqueta etiqueta-opcional';
    etq.textContent = 'opcional';
    nome.appendChild(etq);
  }
  bloco.appendChild(nome);

  if (!e.feito) {
    const nada = document.createElement('p');
    nada.className = 'texto-fraco pequeno m-0 mt-1';
    nada.textContent = 'não feito';
    bloco.appendChild(nada);
    return bloco;
  }

  const series = document.createElement('div');
  series.className = 'resumo-series';
  e.series.forEach((s) => {
    const pilula = document.createElement('span');
    pilula.className = 'resumo-serie' + (s.aquecimento ? ' aquecimento' : '');
    pilula.textContent = (s.aquecimento ? 'aq ' : '') + s.texto;
    if (s.anotacao) pilula.title = s.anotacao;
    series.appendChild(pilula);
  });
  bloco.appendChild(series);
  return bloco;
}

/** Copiar texto e Editar. */
function botoes(resumo) {
  const div = document.createElement('div');
  div.className = 'linha-botoes';

  const copiar = document.createElement('button');
  copiar.className = 'btn btn-primario';
  copiar.dataset.acao = 'copiar';
  copiar.textContent = 'Copiar texto';
  copiar.onclick = async () => {
    const texto = textoParaCopiar(resumo);
    const ok = await copiarTexto(texto);
    if (!ok) {
      // Não conseguiu copiar: mostra o texto para copiar na mão.
      await formulario(
        'Não consegui copiar',
        [{ nome: 'texto', rotulo: 'Selecione e copie', tipo: 'textarea', valor: texto }],
        'Fechar'
      );
      return;
    }
    copiar.textContent = 'Copiado ✓';
    setTimeout(() => {
      copiar.textContent = 'Copiar texto';
    }, 2000);
  };

  const editar = document.createElement('button');
  editar.className = 'btn';
  editar.dataset.acao = 'editar';
  editar.textContent = 'Editar';
  editar.onclick = () => abrir('treino', { sessaoId: resumo.sessaoId });

  div.append(copiar, editar);
  return div;
}
