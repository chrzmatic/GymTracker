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
 * @param {...string} classes classes extras (ex.: 'm-0', 'mt-2')
 */
export function textoFraco(texto, ...classes) {
  const p = document.createElement('p');
  p.className = 'texto-fraco pequeno';
  p.textContent = texto;
  p.classList.add(...classes);
  return p;
}
