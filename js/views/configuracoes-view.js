/** Tela de configurações. */

import { lerTodasConfigs, salvarConfig, CONFIG_PADRAO } from '../data/config-repo.js';
import { NOMES_DIA_SEMANA, formatarDataHora, formatarLongo } from '../utils/date.js';
import {
  lerEstado as lerEstadoDropbox,
  lerAppKey as lerAppKeyDropbox,
} from '../sync/dropbox-estado.js';
import { paraNumero } from '../utils/format.js';
import { formulario, confirmar, avisar } from '../components/dialogo.js';
import * as backup from '../services/backup-service.js';
import {
  restaurarTreinoPadrao,
  restaurarDietaPadrao,
  carregarSeNecessario,
} from '../services/seed-service.js';
import { abrir, recarregar, recomecar } from '../navegacao.js';
import { VERSAO, DATA_DA_VERSAO } from '../versao.js';

export async function montarConfiguracoes(raiz) {
  const config = await lerTodasConfigs();
  raiz.innerHTML = '';

  raiz.appendChild(cardRotacao(config));
  raiz.appendChild(cardPeso());
  raiz.appendChild(cardBackup());
  raiz.appendChild(cardDropbox());
  raiz.appendChild(cardRecomecar());
  raiz.appendChild(rodapeDaVersao());
}

/** Versão do app, no pé da tela. */
function rodapeDaVersao() {
  const p = document.createElement('p');
  p.className = 'texto-fraco pequeno versao-app';
  p.textContent = `Versão ${VERSAO} · ${formatarLongo(DATA_DA_VERSAO)}`;
  return p;
}

/** Atalho do Dropbox, com o status à vista (para notar se o backup parou). */
function cardDropbox() {
  const card = document.createElement('div');
  card.className = 'card';

  const estado = lerEstadoDropbox();
  let resumo;
  if (!lerAppKeyDropbox()) {
    // Sem app key, diz o que falta.
    resumo = 'falta o app key';
  } else if (!estado.refreshToken) {
    resumo = 'não conectado';
  } else if (estado.pendente) {
    resumo = 'pendente';
  } else if (estado.ultimoEm) {
    resumo = formatarDataHora(estado.ultimoEm);
  } else {
    resumo = 'conectado';
  }

  card.appendChild(linha('Dropbox', resumo, () => abrir('dropbox')));

  return card;
}

/**
 * Restaurar dados padrão e apagar tudo.
 * Restaurar não toca no histórico; apagar tudo zera o banco inteiro.
 */
function cardRecomecar() {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = 'Recomeçar';
  h3.style.margin = '0 0 4px';
  card.appendChild(h3);

  card.appendChild(
    linha('Restaurar treinos padrão', 'mantém o histórico', async () => {
      const ok = await confirmar(
        'Restaurar os treinos padrão?',
        'Treinos, exercícios e músculos padrão voltam ao original. O que você criou continua lá, e o histórico de sessões não é tocado.',
        'Restaurar'
      );
      if (!ok) return;
      await restaurarTreinoPadrao();
      await avisar('Pronto', 'Os treinos padrão foram restaurados.');
      await recomecar();
    })
  );

  card.appendChild(
    linha('Restaurar dieta padrão', 'mantém o resto', async () => {
      const ok = await confirmar(
        'Restaurar a dieta padrão?',
        'Alimentos, pratos, refeições e planos padrão voltam ao original. O que você criou continua lá.',
        'Restaurar'
      );
      if (!ok) return;
      await restaurarDietaPadrao();
      await avisar('Pronto', 'A dieta padrão foi restaurada.');
      await recomecar('dieta');
    })
  );

  const apagar = document.createElement('button');
  apagar.className = 'btn btn-perigo btn-bloco';
  apagar.style.marginTop = '10px';
  apagar.textContent = 'Apagar tudo e começar do zero';
  apagar.onclick = async () => {
    const ok = await confirmar(
      'Apagar tudo?',
      'Isso apaga TODAS as sessões registradas, os treinos, os exercícios, o peso corporal e as configurações, e recarrega os dados iniciais. Não tem como desfazer. Se quiser guardar o que existe hoje, cancele e exporte um backup antes.',
      'Apagar tudo'
    );
    if (!ok) return;

    // Segunda confirmação: apaga o histórico sem volta.
    const mesmo = await confirmar(
      'Tem certeza?',
      'Última chance. Todo o histórico de treino será perdido.',
      'Sim, apagar tudo'
    );
    if (!mesmo) return;

    await backup.apagarTudo();
    await carregarSeNecessario();
    await recomecar();
  };
  card.appendChild(apagar);

  return card;
}

/** Exportar e importar. */
function cardBackup() {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = 'Backup';
  h3.style.margin = '0 0 4px';
  card.appendChild(h3);

  card.appendChild(
    linha('Exportar backup (JSON)', 'completo', async () => {
      await exportar(backup.exportarJson());
    })
  );
  card.appendChild(
    linha('Exportar treinos (CSV)', 'uma linha por série', async () => {
      await exportar(backup.exportarTreinosCsv());
    })
  );
  card.appendChild(
    linha('Exportar peso (CSV)', '', async () => {
      await exportar(backup.exportarPesoCsv());
    })
  );
  card.appendChild(linha('Importar backup (JSON)', 'substitui os dados', importar));

  return card;
}

/**
 * Gera e entrega o arquivo, dizendo o que há dentro.
 * Assim um backup sem nenhuma sessão não passa despercebido.
 */
async function exportar(promessa) {
  try {
    const arquivo = await promessa;
    const resultado = await backup.entregar(arquivo);
    if (resultado === 'cancelado') return;

    const onde =
      resultado === 'baixado'
        ? `${arquivo.nome} salvo nos seus downloads.`
        : `${arquivo.nome} entregue ao menu de compartilhar.`;

    if (!arquivo.resumo) {
      await avisar('Exportado', onde);
      return;
    }

    await avisar(
      arquivo.vazio ? 'Exportado, mas sem histórico' : 'Exportado',
      `${onde} Dentro dele: ${arquivo.resumo}.` +
        (arquivo.vazio
          ? ' Ou seja: este arquivo não guarda treino nenhum que você tenha feito.'
          : '')
    );
  } catch (erro) {
    await avisar('Não consegui exportar', String(erro && erro.message ? erro.message : erro));
  }
}

/** Escolhe, valida e restaura um backup, com confirmação. */
async function importar() {
  const arquivo = await backup.escolherArquivo();
  if (!arquivo) return;

  let conteudo;
  try {
    conteudo = await backup.lerArquivo(arquivo);
  } catch {
    await avisar('Arquivo inválido', 'Não consegui ler o JSON. O arquivo pode estar corrompido.');
    return;
  }

  const validacao = backup.validarBackup(conteudo);
  if (!validacao.ok) {
    await avisar('Backup inválido', validacao.erro);
    return;
  }

  // Mostra o que o app perde com a restauração.
  let perdas = [];
  try {
    perdas = await backup.perdasAoRestaurar(conteudo);
  } catch {
    /* Sem a comparação, vale o aviso genérico. */
  }

  const ok = await confirmar(
    'Restaurar este backup?',
    `Backup de ${conteudo.data ?? 'data desconhecida'}: ${backup.descreverBackup(conteudo)}. ` +
      (perdas.length
        ? `VOCÊ VAI PERDER o que este app tem a mais — ${perdas.join('; ')}. `
        : '') +
      'Os dados do app são substituídos pelos do arquivo, e não dá para desfazer. Se quiser guardar o que existe hoje, cancele e exporte antes.',
    'Restaurar'
  );
  if (!ok) return;

  try {
    await backup.restaurar(conteudo);
  } catch (erro) {
    await avisar('Não consegui restaurar', String(erro && erro.message ? erro.message : erro));
    return;
  }

  // Relê o banco antes de dizer que deu certo.
  let divergencias = [];
  try {
    divergencias = await backup.conferirRestauracao(conteudo);
  } catch (erro) {
    await avisar(
      'Restaurei, mas não consegui conferir',
      'Os dados foram gravados, mas a releitura do banco falhou: ' +
        String(erro && erro.message ? erro.message : erro) +
        '. Feche e abra o app para ver como ficou.'
    );
    await recomecar();
    return;
  }

  if (divergencias.length) {
    await avisar(
      'O backup não entrou inteiro',
      'O banco aceitou a gravação mas, relendo, falta coisa — ' +
        divergencias.join('; ') +
        '. Nada foi perdido do arquivo: tente importar de novo, com o app aberto na frente.'
    );
  } else {
    const total = Object.values(validacao.resumo).reduce((soma, n) => soma + n, 0);
    await avisar('Backup restaurado', `${total} registros conferidos no banco.`);
  }

  await recomecar();
}

/** Atalho para o peso corporal. */
function cardPeso() {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = 'Peso corporal';
  h3.style.margin = '0 0 4px';
  card.appendChild(h3);

  const botao = document.createElement('button');
  botao.className = 'btn btn-bloco';
  botao.textContent = 'Registrar e ver histórico';
  botao.onclick = () => abrir('peso');
  card.appendChild(botao);

  return card;
}

/** Configurações da rotação. */
function cardRotacao(config) {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = 'Rotação';
  h3.style.margin = '0 0 4px';
  card.appendChild(h3);

  card.appendChild(
    linha(
      'Semana começa em',
      NOMES_DIA_SEMANA[config.inicioSemana],
      async () => {
        const dados = await formulario('Semana começa em', [
          {
            nome: 'dia',
            rotulo: 'Primeiro dia da semana',
            tipo: 'select',
            valor: String(config.inicioSemana),
            opcoes: NOMES_DIA_SEMANA.map((nome, i) => ({ valor: String(i), rotulo: nome })),
            dica: 'Usado para decidir se um dia está numa "semana nova", e para o contador de séries semanais.',
          },
        ]);
        if (!dados) return;
        await salvarConfig('inicioSemana', Number(dados.dia));
        await recarregar();
      }
    )
  );

  card.appendChild(
    linha(
      'Dias para reiniciar (X)',
      `${config.diasParaReiniciarRotacao} dias`,
      async () => {
        const dados = await formulario('Dias para reiniciar a rotação', [
          {
            nome: 'x',
            rotulo: 'X (dias de calendário)',
            tipo: 'number',
            valor: config.diasParaReiniciarRotacao,
            dica: 'Com X = 2: treinou no domingo, na segunda a rotação continua de onde parou; treinou no sábado, na segunda ela reinicia.',
          },
        ]);
        if (!dados) return;
        const x = paraNumero(dados.x);
        await salvarConfig(
          'diasParaReiniciarRotacao',
          x !== null && x >= 0 ? Math.round(x) : CONFIG_PADRAO.diasParaReiniciarRotacao
        );
        await recarregar();
      }
    )
  );

  return card;
}

/** Linha "rótulo / valor" que abre o editor ao tocar. */
function linha(rotulo, valor, aoTocar) {
  const btn = document.createElement('button');
  btn.className = 'linha-config';
  const nome = document.createElement('span');
  nome.textContent = rotulo;
  const atual = document.createElement('span');
  atual.className = 'texto-fraco';
  atual.textContent = valor;
  btn.append(nome, atual);
  btn.onclick = aoTocar;
  return btn;
}

