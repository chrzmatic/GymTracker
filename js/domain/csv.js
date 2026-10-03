/**
 * Geração de CSV para Excel, Numbers e Google Sheets.
 *
 * Separador `;`, porque o Excel em português usa vírgula decimal.
 * BOM UTF-8 no começo, senão o Excel no Windows estraga os acentos.
 */

export const SEPARADOR = ';';

/** BOM, para o Excel reconhecer UTF-8. */
export const BOM = '﻿';

/** Escapa um valor para uma célula (RFC 4180). */
export function celula(valor) {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  const precisaAspas = texto.includes(SEPARADOR) ||
    texto.includes('"') ||
    texto.includes('\n') ||
    texto.includes('\r');
  if (!precisaAspas) return texto;
  return '"' + texto.replace(/"/g, '""') + '"';
}

/** Número com vírgula decimal. */
export function numero(valor) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '';
  return String(Math.round(valor * 1000) / 1000).replace('.', ',');
}

/**
 * CSV completo, com BOM.
 * @param {string[]} cabecalho
 * @param {Array[]} linhas
 */
export function montarCsv(cabecalho, linhas) {
  const tudo = [cabecalho, ...linhas]
    .map((linha) => linha.map(celula).join(SEPARADOR))
    .join('\r\n');
  return BOM + tudo + '\r\n';
}

/** CSV dos treinos, uma linha por série (bom para filtrar na planilha). */
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
    linhas,
  );
}

export function csvDePeso(pesos) {
  const linhas = pesos
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((p) => [p.data, numero(p.kg)]);
  return montarCsv(['Data', 'Peso (kg)'], linhas);
}

/**
 * Nome de arquivo com a data.
 * @param {string} prefixo
 * @param {string} hoje AAAA-MM-DD
 * @param {string} extensao sem o ponto
 */
export function nomeDeArquivo(prefixo, hoje, extensao) {
  return `${prefixo}-${hoje}.${extensao}`;
}
