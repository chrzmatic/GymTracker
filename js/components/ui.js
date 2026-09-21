/**
 * Peças pequenas de interface, usadas por várias telas.
 */

/**
 * Bloco de "nada aqui ainda".
 *
 * Existe porque a forma óbvia de fazer isso — `raiz.innerHTML += '<div…>'`
 * — é uma armadilha: somar em `innerHTML` re-serializa e re-parseia a
 * árvore inteira, o que **destrói todos os event listeners** já ligados
 * aos elementos que estavam ali. Um botão criado antes dessa linha para
 * de funcionar sem erro nenhum no console.
 *
 * @param {string} texto
 * @returns {HTMLElement}
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
 * @returns {HTMLElement}
 */
export function textoFraco(texto, margem) {
  const p = document.createElement('p');
  p.className = 'texto-fraco pequeno';
  p.textContent = texto;
  if (margem !== undefined) p.style.margin = margem;
  return p;
}
