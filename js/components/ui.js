/** Peças pequenas de interface usadas por várias telas. */

/**
 * Bloco de "nada aqui ainda".
 *
 * Use isto em vez de `innerHTML +=`, que recria os elementos e apaga os
 * eventos de botões já criados.
 */
export function blocoVazio(texto) {
  const div = document.createElement('div');
  div.className = 'vazio';
  div.textContent = texto;
  return div;
}

/**
 * Parágrafo de texto secundário.
 * @param {string} texto
 * @param {string} [margem] valor de style.margin
 */
export function textoFraco(texto, margem) {
  const p = document.createElement('p');
  p.className = 'texto-fraco pequeno';
  p.textContent = texto;
  if (margem !== undefined) p.style.margin = margem;
  return p;
}
