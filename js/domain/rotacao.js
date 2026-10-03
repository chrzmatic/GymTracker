/**
 * Sugestão do próximo treino.
 *
 * A rotação é a lista ordenada dos treinos com `naRotacao`.
 * 1. Sequência: o próximo depois do último feito, dando a volta no fim.
 * 2. Reinício: volta ao primeiro se o dia está numa semana posterior à do
 *    último treino e passaram pelo menos X dias.
 * Treinos extras não contam.
 */

import { diffEmDias, semanaPosterior, somarDias } from '../utils/date.js';

/** Motivo da sugestão, para a tela explicar. */
export const MOTIVO = {
  /** Nada registrado ainda. */
  PRIMEIRO: 'primeiro',
  /** Semana nova e tempo suficiente. */
  REINICIO: 'reinicio',
  /** Segue a sequência. */
  SEQUENCIA: 'sequencia',
};

/**
 * Última sessão de um treino da rotação antes do dia (exclusivo).
 * Usa a rotação atual: treino que saiu dela deixa de contar.
 * @param {Object[]} sessoes
 * @param {Object[]} rotacao treinos da rotação, na ordem
 * @param {string} dia AAAA-MM-DD
 * @returns {Object|null}
 */
export function ultimaSessaoDaRotacao(sessoes, rotacao, dia) {
  const naRotacao = new Set(rotacao.map((t) => t.id));
  const candidatas = sessoes
    .filter((s) => s.data < dia && naRotacao.has(s.treinoId))
    .sort(
      (a, b) => b.data.localeCompare(a.data) || (b.criadaEm ?? 0) - (a.criadaEm ?? 0),
    );
  return candidatas[0] ?? null;
}

/**
 * true se a rotação deve voltar ao primeiro treino.
 * @param {string} dataUltimo AAAA-MM-DD
 * @param {string} dia AAAA-MM-DD
 * @param {{inicioSemana: number, diasParaReiniciarRotacao: number}} config
 */
export function deveReiniciar(dataUltimo, dia, config) {
  const semanaNova = semanaPosterior(dataUltimo, dia, config.inicioSemana);
  const passouTempo = diffEmDias(dataUltimo, dia) >= config.diasParaReiniciarRotacao;
  return semanaNova && passouTempo;
}

/**
 * Treino sugerido para um dia, ou null se a rotação está vazia.
 * @param {Object[]} sessoes
 * @param {Object[]} rotacao treinos da rotação, na ordem
 * @param {string} dia AAAA-MM-DD
 * @param {{inicioSemana: number, diasParaReiniciarRotacao: number}} config
 * @returns {{treino: Object, motivo: string, ultima: Object|null, diasDesde: number|null}|null}
 */
export function sugerirTreino(sessoes, rotacao, dia, config) {
  if (!rotacao.length) return null;

  const ultima = ultimaSessaoDaRotacao(sessoes, rotacao, dia);
  if (!ultima) {
    return { treino: rotacao[0], motivo: MOTIVO.PRIMEIRO, ultima: null, diasDesde: null };
  }

  const diasDesde = diffEmDias(ultima.data, dia);

  if (deveReiniciar(ultima.data, dia, config)) {
    return { treino: rotacao[0], motivo: MOTIVO.REINICIO, ultima, diasDesde };
  }

  const posicao = rotacao.findIndex((t) => t.id === ultima.treinoId);
  const seguinte = rotacao[(posicao + 1) % rotacao.length];
  return { treino: seguinte, motivo: MOTIVO.SEQUENCIA, ultima, diasDesde };
}

/**
 * Dia da sugestão: hoje, ou amanhã se já treinou hoje.
 * @returns {string} AAAA-MM-DD
 */
export function diaDaProximaSugestao(hoje, sessoesDeHoje) {
  return sessoesDeHoje.length ? somarDias(hoje, 1) : hoje;
}

/** Frase curta explicando a sugestão. */
export function explicarSugestao(sugestao) {
  if (!sugestao) return '';
  if (sugestao.motivo === MOTIVO.PRIMEIRO) {
    return 'Primeiro treino registrado — começando pelo início da rotação.';
  }
  const ultimo = `último foi o ${sugestao.ultima.treinoNome}`;
  const quando = sugestao.diasDesde === 0
    ? 'hoje'
    : sugestao.diasDesde === 1
    ? 'ontem'
    : `há ${sugestao.diasDesde} dias`;
  if (sugestao.motivo === MOTIVO.REINICIO) {
    return `Semana nova e ${quando} o ${sugestao.ultima.treinoNome} — reiniciando a rotação.`;
  }
  return `Seguindo a rotação: ${ultimo}, ${quando}.`;
}
