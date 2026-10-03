/**
 * Copiar texto para a área de transferência.
 *
 * Usa `navigator.clipboard` e, se falhar, um <textarea> escondido com
 * `execCommand('copy')`, que funciona em mais navegadores.
 */

/**
 * Copia o texto. Chamar dentro do toque do usuário.
 * @returns {Promise<boolean>} true se copiou
 */
export async function copiarTexto(texto) {
  try {
    if (navigator.clipboard && globalThis.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    /* cai no plano B */
  }
  return copiarComTextarea(texto);
}

/** Plano B: copia por um <textarea> fora da tela. */
function copiarComTextarea(texto) {
  const area = document.createElement('textarea');
  area.value = texto;
  area.setAttribute('readonly', '');
  // Fora da tela; com display: none não daria para selecionar.
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  area.style.opacity = '0';
  // 16px evita o zoom automático do iPhone.
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
