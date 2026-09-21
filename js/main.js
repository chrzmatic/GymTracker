/**
 * Inicialização do app e barra de abas.
 *
 * Responsabilidades:
 *  - abrir o banco e rodar a carga inicial na primeira abertura
 *  - desenhar a barra de abas e o botão de configurações
 *  - lembrar a última aba aberta, para o app voltar onde estava
 *
 * A troca de telas em si vive em js/navegacao.js, que também cuida das
 * sub-telas (editar treino, exercícios, histórico) e do botão de voltar.
 */

import { carregarSeNecessario } from './services/seed-service.js';
import { iniciarNavegacao, irParaAba, abrir, recarregar } from './navegacao.js';

/** Definição das abas, na ordem da barra inferior. */
const ABAS = [
  { id: 'treino', rotulo: 'Treino', icone: '🏋️' },
  { id: 'calendario', rotulo: 'Calendário', icone: '📅' },
  { id: 'comparar', rotulo: 'Comparar', icone: '⇄' },
  { id: 'progresso', rotulo: 'Progresso', icone: '📈' },
  { id: 'dieta', rotulo: 'Dieta', icone: '🍽️' },
];

const CHAVE_ABA = 'gymtracker:aba';

let abaAtual = null;

/** Marca visualmente a aba ativa e guarda qual é. */
function marcarAba(id) {
  abaAtual = id;
  try {
    localStorage.setItem(CHAVE_ABA, id);
  } catch {
    /* modo privado pode bloquear o localStorage; não é crítico */
  }
  document.querySelectorAll('.abas button').forEach((b) => {
    if (b.dataset.aba === id) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

/** Desenha a barra de abas inferior. */
function montarBarraDeAbas() {
  const barra = document.querySelector('.abas');
  barra.innerHTML = '';
  ABAS.forEach((aba) => {
    const btn = document.createElement('button');
    btn.dataset.aba = aba.id;
    btn.innerHTML = '<span class="icone"></span><span class="rotulo"></span>';
    btn.querySelector('.icone').textContent = aba.icone;
    btn.querySelector('.rotulo').textContent = aba.rotulo;
    btn.onclick = () => irParaAba(aba.id).catch(mostrarErro);
    barra.appendChild(btn);
  });
}

/** Mostra um erro fatal em vez de uma tela em branco. */
function mostrarErro(erro) {
  console.error(erro);
  const destino = document.getElementById('conteudo');
  destino.innerHTML =
    '<div class="vazio">Erro ao iniciar o app.<br><span class="pequeno"></span></div>';
  destino.querySelector('.pequeno').textContent = String(
    erro && erro.message ? erro.message : erro
  );
}

/**
 * Liga o ícone de engrenagem do cabeçalho.
 * As configurações entram como sub-tela da aba atual, então o "voltar"
 * devolve você exatamente para onde estava.
 */
function montarBotaoConfig() {
  const btn = document.getElementById('btn-config');
  btn.onclick = () => abrir('configuracoes').catch(mostrarErro);
}

/** Ponto de entrada. */
async function iniciar() {
  montarBarraDeAbas();
  montarBotaoConfig();
  iniciarNavegacao(marcarAba);

  try {
    await carregarSeNecessario();
  } catch (erro) {
    mostrarErro(erro);
    return;
  }

  let inicial = 'treino';
  try {
    const salva = localStorage.getItem(CHAVE_ABA);
    if (salva && ABAS.some((a) => a.id === salva)) inicial = salva;
  } catch {
    /* ignora */
  }

  try {
    await irParaAba(inicial);
  } catch (erro) {
    mostrarErro(erro);
  }
}

// Reconstrói a tela ao voltar do segundo plano, para refletir o banco atual.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && abaAtual) {
    recarregar().catch(mostrarErro);
  }
});

iniciar();
