/**
 * Geração de IDs.
 *
 * IDs criados no app são opacos e únicos. Os IDs da carga inicial são fixos e
 * legíveis (ex.: `ex-mesa-flexora`) e vêm dos arquivos de seed, não daqui.
 */

/**
 * Gera um ID único com prefixo legível.
 * Usa crypto.randomUUID quando disponível; senão, tempo + aleatório.
 * @param {string} prefixo ex.: 'ses', 'set', 'ex'
 * @returns {string}
 */
export function novoId(prefixo) {
  const aleatorio =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefixo}-${Date.now().toString(36)}-${aleatorio}`;
}

/**
 * Transforma um texto em slug kebab-case sem acentos.
 * Usado para sugerir IDs legíveis ao criar exercícios e alimentos.
 * @param {string} texto
 * @returns {string}
 */
export function paraSlug(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
