/**
 * Inicialização do app e barra de abas.
 *
 * Responsabilidades:
 *  - abrir o banco e rodar a carga inicial na primeira abertura
 *  - desenhar a barra de abas e o botão de configurações
 *  - reabrir o app exatamente onde você parou
 *
 * A troca de telas em si vive em js/navegacao.js, que também cuida das
 * sub-telas (editar treino, exercícios, histórico), do botão de voltar e
 * de guardar onde você estava — aba, sub-tela e posição da rolagem.
 */

import { carregarSeNecessario } from './services/seed-service.js';
import {
  iniciarNavegacao,
  irParaAba,
  abrir,
  recarregar,
  voltarParaRaiz,
} from './navegacao.js';

/** Definição das abas, na ordem da barra inferior. */
const ABAS = [
  { id: 'treino', rotulo: 'Treino', icone: '🏋️' },
  { id: 'calendario', rotulo: 'Calendário', icone: '📅' },
  { id: 'comparar', rotulo: 'Comparar', icone: '⇄' },
  { id: 'progresso', rotulo: 'Progresso', icone: '📈' },
  { id: 'dieta', rotulo: 'Dieta', icone: '🍽️' },
];

let abaAtual = null;

/** Marca visualmente a aba ativa. Quem guarda qual é é a navegação. */
function marcarAba(id) {
  abaAtual = id;
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
  const salva = iniciarNavegacao(marcarAba);

  try {
    await carregarSeNecessario();
  } catch (erro) {
    mostrarErro(erro);
    return;
  }

  // Um login do Dropbox que voltou por redirecionamento chega como
  // `?code=` na URL, antes de qualquer tela existir. Tem que ser tratado
  // aqui, e antes de desenhar: senão a tela de configurações abre dizendo
  // "não conectado" enquanto o código ainda está na barra de endereços.
  await concluirLoginDoDropbox();

  const inicial = salva && ABAS.some((a) => a.id === salva) ? salva : 'treino';

  try {
    await irParaAba(inicial);
  } catch (erro) {
    // A tela guardada pode não existir mais — um treino apagado, uma
    // sessão que sumiu num backup restaurado. Em vez de abrir num erro,
    // volta para a raiz da aba e tenta de novo.
    console.warn('[app] não consegui reabrir onde você estava:', erro);
    voltarParaRaiz(inicial);
    try {
      await irParaAba(inicial);
    } catch (segundoErro) {
      mostrarErro(segundoErro);
    }
  }

  // Depois da tela no ar, nunca antes: manda o que ficou pendente e refaz
  // o backup se o último passou de 24 horas. Não é esperado de propósito —
  // abrir o app na academia não pode depender do Dropbox responder.
  backupDeAbertura();
}

/**
 * Conclui um login do Dropbox que voltou pela URL.
 * Só carrega o código do Dropbox se houver mesmo um `?code=` esperando.
 */
async function concluirLoginDoDropbox() {
  if (!window.location.search.includes('code=')) return;
  try {
    const { concluirLoginPendente } = await import('./views/dropbox-view.js');
    await concluirLoginPendente();
  } catch (erro) {
    console.warn('[app] não consegui concluir o login do Dropbox:', erro);
  }
}

/** Backup de abertura, se houver conexão configurada. */
function backupDeAbertura() {
  import('./sync/dropbox-estado.js')
    .then(({ conectado }) => {
      if (!conectado()) return null;
      return import('./sync/dropbox-backup.js').then((m) => m.aoAbrirApp());
    })
    .catch((erro) => console.warn('[app] backup de abertura falhou:', erro));
}

// Reconstrói a tela ao voltar do segundo plano, para refletir o banco atual.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && abaAtual) {
    recarregar().catch(mostrarErro);
  }
});

iniciar();
