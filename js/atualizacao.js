/**
 * Registro do service worker e aviso de versão nova.
 *
 * Quando eu publico uma versão nova, o navegador baixa o service worker
 * novo e o deixa **esperando** — ele só assume quando todas as abas do app
 * fecham. Como o app fica na Tela de Início e raramente "fecha", a
 * atualização poderia demorar dias para aparecer.
 *
 * Por isso a barra: ao detectar um worker esperando, o app mostra "Nova
 * versão disponível" com um botão. O botão manda o worker assumir e
 * recarrega a página. Nada de dados se perde — eles estão no IndexedDB,
 * que o service worker não toca.
 */

/** Evita recarregar em laço se o controlador trocar mais de uma vez. */
let jaRecarregou = false;

/**
 * Só recarrega quando **você** pediu, tocando em "Recarregar".
 *
 * Sem isso o app recarregaria sozinho na primeira visita: o service worker
 * novo chama `clients.claim()` ao ativar, o que dispara `controllerchange`
 * mesmo sem haver atualização nenhuma. Recarregar no meio de um treino,
 * sem ninguém ter pedido, seria o pior momento possível.
 */
let pediuAtualizar = false;

/**
 * Registra o service worker e liga a detecção de atualização.
 * Em `file://` (e em navegador sem suporte) não faz nada.
 * @returns {Promise<void>}
 */
export async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

  try {
    const registro = await navigator.serviceWorker.register('./service-worker.js');

    // Já havia uma versão nova esperando quando o app abriu.
    if (registro.waiting && navigator.serviceWorker.controller) {
      mostrarBarra(registro.waiting);
    }

    registro.addEventListener('updatefound', () => {
      const novo = registro.installing;
      if (!novo) return;
      novo.addEventListener('statechange', () => {
        // `controller` existente significa que já havia uma versão rodando:
        // sem ele, é a primeira instalação e não há nada a avisar.
        if (novo.state === 'installed' && navigator.serviceWorker.controller) {
          mostrarBarra(novo);
        }
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!pediuAtualizar || jaRecarregou) return;
      jaRecarregou = true;
      location.reload();
    });

    // Procura atualização ao voltar para o app, que é quando o usuário
    // costuma reabrir da Tela de Início.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registro.update().catch(() => {});
    });
  } catch (erro) {
    console.warn('[app] service worker não registrado:', erro);
  }
}

/**
 * Mostra a barra de atualização.
 * @param {ServiceWorker} worker o worker que está esperando
 */
function mostrarBarra(worker) {
  if (document.querySelector('.faixa-atualizacao')) return;

  const barra = document.createElement('div');
  barra.className = 'faixa-atualizacao';
  barra.setAttribute('role', 'status');

  const texto = document.createElement('span');
  texto.className = 'cresce';
  texto.textContent = 'Nova versão disponível';
  barra.appendChild(texto);

  const depois = document.createElement('button');
  depois.className = 'btn';
  depois.textContent = 'Depois';
  depois.onclick = () => barra.remove();
  barra.appendChild(depois);

  const agora = document.createElement('button');
  agora.className = 'btn';
  agora.textContent = 'Recarregar';
  agora.onclick = () => {
    agora.disabled = true;
    agora.textContent = 'Atualizando…';
    pediuAtualizar = true;
    worker.postMessage('assumir-agora');
  };
  barra.appendChild(agora);

  document.body.appendChild(barra);
}
