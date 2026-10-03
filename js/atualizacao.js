/**
 * Service worker e aviso de versão nova.
 *
 * A versão nova fica esperando até todas as abas do app fecharem, o que no
 * iPhone pode levar dias. Por isso a barra "Nova versão disponível", que
 * manda o worker assumir e recarrega. Os dados ficam no IndexedDB e não se perdem.
 */

/** Evita recarregar em laço. */
let jaRecarregou = false;

/**
 * Só recarrega quando o usuário pede. Na primeira visita o worker também
 * dispara `controllerchange`, e recarregar no meio do treino seria ruim.
 */
let pediuAtualizar = false;

/** Registra o service worker e vigia atualizações. Não faz nada em `file://`. */
export async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;

  try {
    const registro = await navigator.serviceWorker.register('./service-worker.js');

    // Já havia versão nova esperando ao abrir.
    if (registro.waiting && navigator.serviceWorker.controller) {
      mostrarBarra(registro.waiting);
    }

    registro.addEventListener('updatefound', () => {
      const novo = registro.installing;
      if (!novo) return;
      novo.addEventListener('statechange', () => {
        // Sem `controller` é a primeira instalação: não há nada a avisar.
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

    // Procura atualização ao voltar para o app.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registro.update().catch(() => {});
    });
  } catch (erro) {
    console.warn('[app] service worker não registrado:', erro);
  }
}

/** Mostra a barra de atualização. */
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
