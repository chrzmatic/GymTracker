/**
 * Sugestão do próximo treino (especificação, seção 6.4).
 *
 * Nada de A/B/C fixo no código: a rotação é a lista ordenada de treinos
 * marcados como `naRotacao`, e pode ter qualquer tamanho e qualquer ordem.
 * Mudar a rotação na tela de edição muda a sugestão na hora.
 *
 * A regra tem duas partes:
 *
 *  1. **Sequência.** O sugerido é o treino seguinte ao último feito, na
 *     ordem da rotação, dando a volta no fim (…, C, A, B, …).
 *
 *  2. **Reinício.** Volta para o primeiro da rotação só quando as DUAS
 *     condições valem: o dia está numa semana posterior à do último treino,
 *     E passaram pelo menos X dias de calendário desde ele. As duas juntas
 *     são o que separa "semana nova de verdade" de "treinei domingo e hoje
 *     é segunda" — neste segundo caso a semana virou, mas foi ontem, então
 *     a sequência continua.
 *
 * Treinos extras são ignorados por completo: não contam como "último
 * treino" nem avançam a sequência.
 */

import { diffEmDias, semanaPosterior, somarDias } from '../utils/date.js';

/** Por que aquele treino foi sugerido. A tela usa isto para explicar. */
export const MOTIVO = {
  /** Nada registrado ainda: começa do começo. */
  PRIMEIRO: 'primeiro',
  /** Semana nova e tempo suficiente: reinicia a rotação. */
  REINICIO: 'reinicio',
  /** Segue a sequência a partir do último treino. */
  SEQUENCIA: 'sequencia',
};

/**
 * A última sessão de um treino da rotação feita **antes** de um dia.
 *
 * Duas escolhas que valem explicar:
 *
 * - O corte é `data < dia`, exclusivo, porque a especificação diz que a
 *   sugestão para um dia considera apenas as sessões registradas antes
 *   dele. Consequência: se você já treinou hoje e quiser uma segunda
 *   sessão no mesmo dia, a sugestão não conta a primeira — aí é escolher
 *   na mão.
 *
 * - "Da rotação" é decidido pela rotação **atual**, não pelo campo
 *   `naRotacao` congelado na sessão. Se um treino saiu da rotação depois,
 *   as sessões antigas dele deixam de contar, porque ele não tem mais
 *   lugar na sequência.
 *
 * @param {Object[]} sessoes todas as sessões
 * @param {Object[]} rotacao treinos da rotação, na ordem
 * @param {string} dia AAAA-MM-DD
 * @returns {Object|null} a sessão mais recente que conta, ou null
 */
export function ultimaSessaoDaRotacao(sessoes, rotacao, dia) {
  const naRotacao = new Set(rotacao.map((t) => t.id));
  const candidatas = sessoes
    .filter((s) => s.data < dia && naRotacao.has(s.treinoId))
    .sort(
      (a, b) => b.data.localeCompare(a.data) || (b.criadaEm ?? 0) - (a.criadaEm ?? 0)
    );
  return candidatas[0] ?? null;
}

/**
 * Diz se a rotação deve reiniciar no primeiro treino.
 * @param {string} dataUltimo AAAA-MM-DD do último treino
 * @param {string} dia AAAA-MM-DD do dia sugerido
 * @param {{inicioSemana: number, diasParaReiniciarRotacao: number}} config
 * @returns {boolean}
 */
export function deveReiniciar(dataUltimo, dia, config) {
  const semanaNova = semanaPosterior(dataUltimo, dia, config.inicioSemana);
  const passouTempo = diffEmDias(dataUltimo, dia) >= config.diasParaReiniciarRotacao;
  return semanaNova && passouTempo;
}

/**
 * Sugere o treino de um dia.
 *
 * @param {Object[]} sessoes todas as sessões registradas
 * @param {Object[]} rotacao treinos da rotação, na ordem definida pelo usuário
 * @param {string} dia AAAA-MM-DD
 * @param {{inicioSemana: number, diasParaReiniciarRotacao: number}} config
 * @returns {{treino: Object, motivo: string, ultima: Object|null, diasDesde: number|null}|null}
 *   null quando não há nenhum treino na rotação
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
 * Para que dia a tela inicial deve sugerir um treino.
 *
 * Se ainda não treinou hoje, a pergunta é "o que faço hoje?". Se já
 * treinou, a pergunta vira "o que faço na próxima" — e a sugestão passa
 * para amanhã, já contando o treino de hoje na sequência. Sugerir para
 * hoje um treino que já foi feito não ajuda em nada.
 *
 * @param {string} hoje AAAA-MM-DD
 * @param {Object[]} sessoesDeHoje sessões registradas hoje
 * @returns {string} AAAA-MM-DD do dia a sugerir
 */
export function diaDaProximaSugestao(hoje, sessoesDeHoje) {
  return sessoesDeHoje.length ? somarDias(hoje, 1) : hoje;
}

/**
 * Frase curta explicando a sugestão, para mostrar embaixo do nome do treino.
 * @param {{motivo: string, ultima: Object|null, diasDesde: number|null}} sugestao
 * @returns {string}
 */
export function explicarSugestao(sugestao) {
  if (!sugestao) return '';
  if (sugestao.motivo === MOTIVO.PRIMEIRO) {
    return 'Primeiro treino registrado — começando pelo início da rotação.';
  }
  const ultimo = `último foi o ${sugestao.ultima.treinoNome}`;
  const quando =
    sugestao.diasDesde === 0
      ? 'hoje'
      : sugestao.diasDesde === 1
        ? 'ontem'
        : `há ${sugestao.diasDesde} dias`;
  if (sugestao.motivo === MOTIVO.REINICIO) {
    return `Semana nova e ${quando} o ${sugestao.ultima.treinoNome} — reiniciando a rotação.`;
  }
  return `Seguindo a rotação: ${ultimo}, ${quando}.`;
}
