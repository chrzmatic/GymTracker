/**
 * Início do app: carga inicial, barra de abas e reabrir onde você parou.
 * A troca de telas fica em navegacao.js.
 */

import { carregarSeNecessario } from './services/seed-service.js';
import {
  abrir,
  iniciarNavegacao,
  irParaAba,
  recarregar,
  voltarParaRaiz,
} from './navegacao.js';

/** Abas, na ordem da barra. */
const ABAS = [
  { id: 'treino', rotulo: 'Treino', icone: '🏋️' },
  { id: 'calendario', rotulo: 'Calendário', icone: '📅' },
  { id: 'comparar', rotulo: 'Comparar', icone: '⇄' },
  { id: 'progresso', rotulo: 'Progresso', icone: '📈' },
  { id: 'dieta', rotulo: 'Dieta', icone: '🍽️' },
];

let abaAtual = null;

/** Marca a aba ativa na barra. */
function marcarAba(id) {
  abaAtual = id;
  document.querySelectorAll('.abas button').forEach((b) => {
    if (b.dataset.aba === id) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

/** Desenha a barra de abas. */
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

/** Mostra um erro em vez de uma tela em branco. */
function mostrarErro(erro) {
  console.error(erro);
  const destino = document.getElementById('conteudo');
  destino.innerHTML =
    '<div class="vazio">Erro ao iniciar o app.<br><span class="pequeno"></span></div>';
  destino.querySelector('.pequeno').textContent = String(
    erro && erro.message ? erro.message : erro,
  );
}

/** Engrenagem do cabeçalho: abre as configurações por cima da aba atual. */
function montarBotaoConfig() {
  const btn = document.getElementById('btn-config');
  btn.onclick = () => abrir('configuracoes').catch(mostrarErro);
}

async function iniciar() {
  montarBarraDeAbas();
  montarBotaoConfig();
  const salva = iniciarNavegacao(marcarAba);

  try {
    await carregarSeNecessario();
  } catch (erro) {
    mostrarErro(erro);
    return;
  }

  // Login do Dropbox que voltou por redirecionamento (`?code=` na URL).
  // Precisa vir antes de desenhar qualquer tela.
  await concluirLoginDoDropbox();

  const inicial = salva && ABAS.some((a) => a.id === salva) ? salva : 'treino';

  try {
    await irParaAba(inicial);
  } catch (erro) {
    // A tela guardada pode não existir mais (sessão apagada, backup restaurado).
    // Nesse caso, abre a raiz da aba.
    console.warn('[app] não consegui reabrir onde você estava:', erro);
    voltarParaRaiz(inicial);
    try {
      await irParaAba(inicial);
    } catch (segundoErro) {
      mostrarErro(segundoErro);
    }
  }

  // Só depois da tela no ar e sem esperar: abrir o app não pode depender do Dropbox.
  backupDeAbertura();
}

/** Conclui um login do Dropbox que voltou pela URL. */
async function concluirLoginDoDropbox() {
  if (!window.location.search.includes('code=')) return;
  try {
    const { concluirLoginPendente } = await import('./views/dropbox-view.js');
    await concluirLoginPendente();
  } catch (erro) {
    console.warn('[app] não consegui concluir o login do Dropbox:', erro);
  }
}

/** Backup de abertura, se o Dropbox estiver conectado. */
function backupDeAbertura() {
  import('./sync/dropbox-estado.js')
    .then(({ conectado }) => {
      if (!conectado()) return null;
      return import('./sync/dropbox-backup.js').then((m) => m.aoAbrirApp());
    })
    .catch((erro) => console.warn('[app] backup de abertura falhou:', erro));
}

// Ao voltar do segundo plano, redesenha com os dados atuais.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && abaAtual) {
    recarregar().catch(mostrarErro);
  }
});

iniciar();
