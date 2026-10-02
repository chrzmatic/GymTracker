/**
 * Copiar texto para a área de transferência.
 *
 * A API moderna (`navigator.clipboard`) só existe em contexto seguro
 * (https ou localhost) e pode recusar sem motivo aparente em versões
 * antigas do Safari. Por isso há um plano B com um <textarea> escondido e
 * `execCommand('copy')`, que ainda é o que funciona em mais lugares.
 */

/**
 * Copia o texto. Precisa ser chamada dentro do toque do usuário.
 * @param {string} texto
 * @returns {Promise<boolean>} true se copiou
 */
export async function copiarTexto(texto) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    /* cai no plano B */
  }
  return copiarComTextarea(texto);
}

/**
 * Plano B: seleciona o texto num <textarea> fora da tela e copia.
 * @param {string} texto
 * @returns {boolean}
 */
function copiarComTextarea(texto) {
  const area = document.createElement('textarea');
  area.value = texto;
  area.setAttribute('readonly', '');
  // Fora da tela, mas não `display: none`: elemento invisível não seleciona.
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  area.style.opacity = '0';
  // Fonte de 16px evita o zoom automático do iPhone ao focar.
  area.style.fontSize = '16px';
  document.body.appendChild(area);
  try {
    area.select();
    area.setSelectionRange(0, texto.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
