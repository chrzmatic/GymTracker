/**
 * Tela de configurações.
 *
 * Nesta etapa entram só as duas que a lógica da rotação usa: o dia em que
 * a semana começa e o X de dias para reiniciar a rotação. O resto (peso
 * corporal, restaurar dados padrão, Dropbox) chega nas etapas 5, 6 e 9.
 */

import { lerTodasConfigs, salvarConfig, CONFIG_PADRAO } from '../data/config-repo.js';
import { NOMES_DIA_SEMANA } from '../utils/date.js';
import { paraNumero } from '../utils/format.js';
import { formulario, confirmar, avisar } from '../components/dialogo.js';
import * as backup from '../services/backup-service.js';
import {
  restaurarTreinoPadrao,
  restaurarDietaPadrao,
  carregarSeNecessario,
} from '../services/seed-service.js';
import { abrir, recarregar } from '../navegacao.js';

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
  raiz.appendChild(cardRecomecar());
  raiz.appendChild(cardFuturo());
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
      location.reload();
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
      location.reload();
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
    location.reload();
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
 * Gera o arquivo e entrega ao usuário, avisando o que aconteceu.
 * @param {Promise<Object>} promessa
 */
async function exportar(promessa) {
  try {
    const arquivo = await promessa;
    const resultado = await backup.entregar(arquivo);
    if (resultado === 'baixado') {
      await avisar('Exportado', `Arquivo ${arquivo.nome} salvo nos seus downloads.`);
    }
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

  const resumo = Object.entries(validacao.resumo)
    .filter(([, n]) => n > 0)
    .map(([store, n]) => `${n} em ${store}`)
    .join(', ');

  const ok = await confirmar(
    'Restaurar este backup?',
    `Backup de ${conteudo.data ?? 'data desconhecida'}, com ${resumo || 'nenhum registro'}. ` +
      'Todos os dados atuais do app serão SUBSTITUÍDOS pelos do arquivo. Isso não pode ser desfeito — se quiser guardar o estado atual, exporte antes.',
    'Restaurar'
  );
  if (!ok) return;

  try {
    await backup.restaurar(conteudo);
    await avisar('Backup restaurado', 'O app vai recarregar para aplicar os dados.');
    location.reload();
  } catch (erro) {
    await avisar('Não consegui restaurar', String(erro && erro.message ? erro.message : erro));
  }
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

/** O que ainda não existe, para não parecer que sumiu. */
function cardFuturo() {
  const card = document.createElement('div');
  card.className = 'card';

  const h3 = document.createElement('h3');
  h3.textContent = 'Ainda por vir';
  h3.style.margin = '0 0 4px';
  card.appendChild(h3);

  const lista = document.createElement('ul');
  lista.className = 'texto-fraco pequeno';
  lista.style.margin = '0';
  lista.style.paddingLeft = '18px';
  ['Conectar ao Dropbox (Etapa 9)'].forEach((texto) => {
    const li = document.createElement('li');
    li.textContent = texto;
    lista.appendChild(li);
  });
  card.appendChild(lista);

  const nota = document.createElement('p');
  nota.className = 'texto-fraco pequeno';
  nota.style.margin = '10px 0 0';
  nota.textContent =
    'Editar treinos, exercícios e músculos fica na aba Treino, em "Treinos e exercícios" — é coisa de toda semana, não de configuração.';
  card.appendChild(nota);

  return card;
}
