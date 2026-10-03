/** Sessões de treino. A data é local, AAAA-MM-DD. */
import { lerTudo, ler, gravar, apagar, lerPorIndice } from './db.js';
import { STATUS } from '../utils/constantes.js';

const STORE = 'sessoes';

export { STATUS };

/** Sessões, da mais recente para a mais antiga. */
export async function listarSessoes() {
  const itens = await lerTudo(STORE);
  return itens.sort(
    (a, b) => b.data.localeCompare(a.data) || (b.criadaEm ?? 0) - (a.criadaEm ?? 0)
  );
}

export async function listarSessoesDaData(data) {
  const itens = await lerPorIndice(STORE, 'data', data);
  return itens.sort((a, b) => (a.criadaEm ?? 0) - (b.criadaEm ?? 0));
}

/** A sessão em andamento, se houver (só existe uma). */
export async function buscarSessaoEmAndamento() {
  const itens = await lerPorIndice(STORE, 'status', STATUS.EM_ANDAMENTO);
  return itens.sort((a, b) => (b.criadaEm ?? 0) - (a.criadaEm ?? 0))[0];
}

export function buscarSessao(id) {
  return ler(STORE, id);
}

export async function salvarSessao(sessao) {
  await gravar(STORE, sessao);
}

/** Apaga a sessão. As séries são apagadas pelo serviço. */
export function removerSessao(id) {
  return apagar(STORE, id);
}
