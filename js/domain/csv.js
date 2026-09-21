/**
 * Geração de CSV (especificação, seção 6.8).
 *
 * O arquivo precisa abrir no Excel, no Numbers e no Google Sheets. Duas
 * decisões nascem disso:
 *
 *  - **Separador ponto e vírgula.** O Excel em português usa vírgula como
 *    separador decimal, e um CSV separado por vírgula com números em
 *    "62,5" fica ilegível: cada número vira duas colunas. Com ponto e
 *    vírgula os dois convivem.
 *
 *  - **BOM UTF-8 no começo.** Sem ele o Excel no Windows lê o arquivo como
 *    ANSI e "Tríceps" vira "TrÃ­ceps".
 */

/** Separador de colunas. Ver o comentário acima. */
export const SEPARADOR = ';';

/** Marca de ordem de bytes, para o Excel reconhecer UTF-8. */
export const BOM = '﻿';

/**
 * Escapa um valor para uma célula de CSV.
 *
 * Aspas, separador e quebra de linha obrigam a envolver em aspas duplas, e
 * aspas internas são dobradas. É o formato do RFC 4180, que os três
 * programas entendem.
 *
 * @param {*} valor
 * @returns {string}
 */
export function celula(valor) {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  const precisaAspas =
    texto.includes(SEPARADOR) ||
    texto.includes('"') ||
    texto.includes('\n') ||
    texto.includes('\r');
  if (!precisaAspas) return texto;
  return '"' + texto.replace(/"/g, '""') + '"';
}

/**
 * Formata um número para a planilha, com vírgula decimal.
 * @param {number|null|undefined} valor
 * @returns {string}
 */
export function numero(valor) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '';
  return String(Math.round(valor * 1000) / 1000).replace('.', ',');
}

/**
 * Monta um CSV a partir do cabeçalho e das linhas.
 * @param {string[]} cabecalho
 * @param {Array[]} linhas
 * @returns {string} com BOM, pronto para virar arquivo
 */
export function montarCsv(cabecalho, linhas) {
  const tudo = [cabecalho, ...linhas]
    .map((linha) => linha.map(celula).join(SEPARADOR))
    .join('\r\n');
  return BOM + tudo + '\r\n';
}

/**
 * CSV dos treinos: uma linha por série registrada.
 *
 * Uma linha por série (e não por sessão) é o que permite filtrar e montar
 * tabela dinâmica na planilha depois.
 *
 * @param {Object[]} sessoes
 * @param {Object[]} series
 * @param {Map<string, Object>} exercicios
 * @returns {string}
 */
export function csvDeTreinos(sessoes, series, exercicios) {
  const porId = new Map(sessoes.map((s) => [s.id, s]));

  const linhas = series
    .slice()
    .sort((a, b) => {
      const sa = porId.get(a.sessaoId);
      const sb = porId.get(b.sessaoId);
      if (!sa || !sb) return 0;
      return (
        sa.data.localeCompare(sb.data) ||
        (sa.criadaEm ?? 0) - (sb.criadaEm ?? 0) ||
        (a.ordemItem ?? 0) - (b.ordemItem ?? 0) ||
        Number(Boolean(b.aquecimento)) - Number(Boolean(a.aquecimento)) ||
        (a.numero ?? 0) - (b.numero ?? 0)
      );
    })
    .map((serie) => {
      const sessao = porId.get(serie.sessaoId);
      const exercicio = exercicios.get(serie.exercicioId);
      return [
        sessao ? sessao.data : '',
        sessao ? sessao.treinoNome : '',
        sessao ? sessao.status : '',
        (serie.ordemItem ?? 0) + 1,
        exercicio ? exercicio.nome : serie.exercicioId,
        exercicio ? exercicio.tipoCarga : '',
        serie.aquecimento ? 'aquecimento' : 'valendo',
        serie.numero,
        numero(serie.carga),
        serie.reps ?? '',
        serie.anotacao ?? '',
        sessao ? (sessao.anotacao ?? '') : '',
      ];
    });

  return montarCsv(
    [
      'Data',
      'Treino',
      'Status',
      'Posição no treino',
      'Exercício',
      'Tipo de carga',
      'Categoria',
      'Série',
      'Carga',
      'Reps',
      'Anotação da série',
      'Anotação da sessão',
    ],
    linhas
  );
}

/**
 * CSV do peso corporal.
 * @param {Object[]} pesos
 * @returns {string}
 */
export function csvDePeso(pesos) {
  const linhas = pesos
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((p) => [p.data, numero(p.kg)]);
  return montarCsv(['Data', 'Peso (kg)'], linhas);
}

/**
 * Nome de arquivo com a data de hoje.
 * @param {string} prefixo
 * @param {string} hoje AAAA-MM-DD
 * @param {string} extensao sem o ponto
 * @returns {string}
 */
export function nomeDeArquivo(prefixo, hoje, extensao) {
  return `${prefixo}-${hoje}.${extensao}`;
}
