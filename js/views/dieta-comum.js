/** Peças compartilhadas pelas telas de edição da dieta. */

import * as dieta from '../services/dieta-service.js';
import { UNIDADES } from '../domain/nutricao.js';
import { num } from '../utils/format.js';
import { avisar, escolherComBusca } from '../components/dialogo.js';

/** Unidades nos formulários. */
export const OPCOES_UNIDADE = [
  { valor: UNIDADES.G, rotulo: 'gramas (g)' },
  { valor: UNIDADES.ML, rotulo: 'mililitros (ml)' },
  { valor: UNIDADES.UNIDADE, rotulo: 'unidade (fatia, lata, ovo…)' },
];

/** Busca de alimentos. Devolve o id ou null. */
export async function escolherAlimento(titulo) {
  const lista = await dieta.listarAlimentos();
  if (!lista.length) {
    await avisar('Índice vazio', 'Cadastre alimentos primeiro.');
    return null;
  }
  return escolherComBusca(
    titulo,
    lista.map((a) => ({
      valor: a.id,
      rotulo: a.nome,
      detalhe: `${num(a.kcal, 0)} kcal/${num(a.quantidadeRef, 0)}${a.unidade}`,
    }))
  );
}
