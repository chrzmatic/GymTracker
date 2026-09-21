/**
 * Constantes compartilhadas por mais de uma camada.
 * Fica em utils (a camada mais baixa) para não criar dependência cruzada
 * entre domínio e dados.
 */

/** Status possíveis de uma sessão de treino. */
export const STATUS = {
  EM_ANDAMENTO: 'em-andamento',
  FINALIZADA: 'finalizada',
};

/** Tipos de carga de um exercício. Decide quais campos a série mostra. */
export const TIPOS_CARGA = {
  CARGA: 'carga',
  PESO_CORPORAL: 'peso-corporal',
  ASSISTIDO: 'assistido',
};

/** Rótulo do campo de carga conforme o tipo do exercício. */
export const ROTULO_CARGA = {
  [TIPOS_CARGA.CARGA]: 'kg',
  [TIPOS_CARGA.PESO_CORPORAL]: '+kg',
  [TIPOS_CARGA.ASSISTIDO]: 'assist. kg',
};

/** Nome legível de cada tipo de carga. */
export const NOME_TIPO_CARGA = {
  [TIPOS_CARGA.CARGA]: 'Carga',
  [TIPOS_CARGA.PESO_CORPORAL]: 'Peso corporal',
  [TIPOS_CARGA.ASSISTIDO]: 'Assistido',
};
