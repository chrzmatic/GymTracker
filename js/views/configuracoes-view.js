/**
 * Tela de configurações.
 *
 * Nesta etapa entram só as duas que a lógica da rotação usa: o dia em que
 * a semana começa e o X de dias para reiniciar a rotação. O resto (peso
 * corporal, restaurar dados padrão, Dropbox) chega nas etapas 5, 6 e 9.
 */

import { lerTodasConfigs, salvarConfig, CONFIG_PADRAO } from '../data/config-repo.js';
import { NOMES_DIA_SEMANA, formatarDataHora } from '../utils/date.js';
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

/**
 * Renderiza a tela de configurações.
 * @param {HTMLElement} raiz
 * @returns {Promise<void>}
 */
export async function montarConfiguracoes(raiz) {
  const config = await lerTodasConfigs();
  raiz.innerHTML = '';

  raiz.appendChild(cardRotacao(config));
  raiz.appendChild(cardPeso());
  raiz.appendChild(cardBackup());
  raiz.appendChild(cardDropbox());
  raiz.appendChild(cardRecomecar());
  raiz.appendChild(cardOndeFica());
}

/**
 * Atalho para o backup no Dropbox, com o status resumido.
 *
 * O status aparece aqui, e não só lá dentro, porque backup é uma coisa em
 * que ninguém toca até precisar: se o app parou de enviar há duas semanas,
 * eu preciso tropeçar nessa informação, não ir procurar por ela.
 */
function cardDropbox() {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = 'Dropbox';
  h3.style.margin = '0 0 4px';
  card.appendChild(h3);

  const estado = lerEstadoDropbox();
  let resumo;
  if (!lerAppKeyDropbox()) {
    // "não conectado" mandaria você tocar em conectar e esbarrar num
    // pedido de app key sem explicação. Melhor dizer o que falta.
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

  const explica = document.createElement('p');
  explica.className = 'texto-fraco pequeno';
  explica.textContent =
    'Backup automático na nuvem: ao terminar um treino, ao mexer na dieta e uma vez por dia. É o que faz o histórico sobreviver à troca de aparelho.';
  card.appendChild(explica);

  card.appendChild(linha('Backup no Dropbox', resumo, () => abrir('dropbox')));

  return card;
}

/**
 * Restaurar os dados padrão e apagar tudo.
 *
 * São duas coisas diferentes, e a diferença importa:
 *
 *  - **Restaurar treinos padrão** devolve os treinos, exercícios e
 *    músculos do `TREINO-DADOS.md`, e **não toca no histórico**. Serve
 *    para desfazer uma bagunça na edição sem perder o que você treinou.
 *  - **Apagar tudo** zera o banco inteiro, inclusive o histórico, e
 *    recarrega os dados padrão. Serve para testar do zero.
 */
function cardRecomecar() {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = 'Recomeçar';
  h3.style.margin = '0 0 4px';
  card.appendChild(h3);

  const explica = document.createElement('p');
  explica.className = 'texto-fraco pequeno';
  explica.textContent =
    'Restaurar padrão devolve os treinos do arquivo de dados iniciais e mantém o seu histórico. Apagar tudo zera o app inteiro, inclusive as sessões registradas.';
  card.appendChild(explica);

  card.appendChild(
    linha('Restaurar treinos padrão', 'mantém o histórico', async () => {
      const ok = await confirmar(
        'Restaurar os treinos padrão?',
        'Treinos, exercícios e músculos voltam a ser os do arquivo de dados iniciais. Qualquer treino ou exercício que você criou por conta própria continua lá; os que têm o mesmo ID dos padrões voltam ao original. O histórico de sessões não é tocado.',
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
        'Índice de alimentos, pratos, refeições e planos voltam a ser os do arquivo de dados iniciais. O que você criou por conta própria continua lá; o que tem o mesmo ID dos padrões volta ao original.',
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

    // Segunda confirmação: é a única ação do app que apaga histórico sem
    // volta, e um toque errado aqui custaria meses de registro.
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

/**
 * Exportar e importar (especificação, seção 6.8).
 *
 * No iPhone a exportação abre o menu de compartilhar do sistema, que deixa
 * salvar no app Arquivos; no computador, baixa direto.
 */
function cardBackup() {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = 'Backup';
  h3.style.margin = '0 0 4px';
  card.appendChild(h3);

  const explica = document.createElement('p');
  explica.className = 'texto-fraco pequeno';
  explica.textContent =
    'O JSON é o backup completo (treinos, histórico, peso e configurações) e é o que o "Importar" lê de volta. Os CSV são para abrir no Excel, Numbers ou Google Sheets.';
  card.appendChild(explica);

  const nota = document.createElement('p');
  nota.className = 'texto-fraco pequeno';
  nota.textContent =
    'Cada endereço guarda seus dados separadamente: o app no localhost, o app publicado na internet e o ícone na Tela de Início são três cofres diferentes, e nenhum enxerga o do outro. Exportar aqui e importar lá é justamente como mudar de um para o outro.';
  card.appendChild(nota);

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
 * Gera o arquivo e entrega ao usuário, dizendo o que foi dentro dele.
 *
 * O "o que foi dentro" não é firula: um backup tirado de uma instalação
 * nova tem 79 registros só de treinos e alimentos padrão, e parece cheio.
 * Sem esta linha dá para guardar durante meses um arquivo que não tem
 * nenhuma sessão sua — e só descobrir na hora de restaurar.
 *
 * @param {Promise<Object>} promessa
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
          ? ' Ou seja: este arquivo não guarda treino nenhum que você tenha feito. Se você esperava histórico aqui, é porque este app está com os dados de outro lugar — veja a nota sobre endereços em "Backup".'
          : '')
    );
  } catch (erro) {
    await avisar('Não consegui exportar', String(erro && erro.message ? erro.message : erro));
  }
}

/** Escolhe um arquivo, valida e restaura com confirmação. */
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

  // O que este app perde se o arquivo for adiante. Restaurar substitui,
  // então tudo que o backup tem a menos some — e é isso que precisa estar
  // na frente dos olhos, não a contagem total.
  let perdas = [];
  try {
    perdas = await backup.perdasAoRestaurar(conteudo);
  } catch {
    /* sem a comparação, o aviso genérico abaixo ainda vale */
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

  // Relê o banco antes de comemorar. O app já disse "restaurado" para um
  // backup que não tinha entrado; agora, se a contagem não bater, quem
  // avisa é a tela — e com o nome do que faltou.
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

/** Atalho para o peso corporal, que alimenta os cálculos de carga efetiva. */
function cardPeso() {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = 'Peso corporal';
  h3.style.margin = '0 0 4px';
  card.appendChild(h3);

  const explica = document.createElement('p');
  explica.className = 'texto-fraco pequeno';
  explica.textContent =
    'Necessário para calcular a carga efetiva de barra fixa, paralelas e exercícios assistidos. Sem ele, a comparação desses exercícios usa só reps e o kg registrado.';
  card.appendChild(explica);

  const botao = document.createElement('button');
  botao.className = 'btn btn-bloco';
  botao.textContent = 'Registrar e ver histórico';
  botao.onclick = () => abrir('peso');
  card.appendChild(botao);

  return card;
}

/** As duas configurações que mudam a sugestão do próximo treino. */
function cardRotacao(config) {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = 'Rotação';
  h3.style.margin = '0 0 4px';
  card.appendChild(h3);

  const explica = document.createElement('p');
  explica.className = 'texto-fraco pequeno';
  explica.textContent =
    'A rotação volta para o primeiro treino só quando as duas coisas valem ao mesmo tempo: o dia cai numa semana posterior à do último treino, e passaram pelo menos X dias desde ele.';
  card.appendChild(explica);

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

/**
 * Uma linha "rótulo / valor atual", que abre o editor ao ser tocada.
 * @param {string} rotulo
 * @param {string} valor
 * @param {() => void} aoTocar
 * @returns {HTMLElement}
 */
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

/**
 * Onde mora o que não está aqui.
 *
 * Sobrou da lista de "ainda por vir", que morreu com a Etapa 9. A nota
 * continua útil: sem ela, procurar a edição de treinos nas configurações é
 * o primeiro reflexo de quem abre esta tela.
 */
function cardOndeFica() {
  const card = document.createElement('div');
  card.className = 'card';

  const nota = document.createElement('p');
  nota.className = 'texto-fraco pequeno';
  nota.style.margin = '0';
  nota.textContent =
    'Editar treinos, exercícios e músculos fica na aba Treino, em "Treinos e exercícios" — é coisa de toda semana, não de configuração.';
  card.appendChild(nota);

  return card;
}
