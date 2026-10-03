/** Geração de IDs. */

/** ID único com prefixo legível (ex.: 'ses-…'). */
export function novoId(prefixo) {
  const aleatorio = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefixo}-${Date.now().toString(36)}-${aleatorio}`;
}

/** Texto para slug sem acentos (ex.: 'mesa-flexora'). */
export function paraSlug(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
