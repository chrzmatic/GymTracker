/**
 * Telas de exercícios: a lista com busca e o editor de um exercício.
 *
 * O editor é onde se define o **tipo de carga** (que decide quais campos a
 * série mostra) e o **mapeamento de músculos** (direto conta 1 série,
 * indireto conta uma fração), que é o que alimenta o contador de séries
 * semanais da Etapa 5.
 *
 * Renomear nunca muda o ID: é o ID que liga o histórico de sessões ao
 * exercício, então um exercício renomeado mantém todo o passado dele.
 */

import * as exercicios from '../services/exercicio-service.js';
import * as treinos from '../services/treino-service.js';
import { TIPOS_CARGA, NOME_TIPO_CARGA, ROTULO_CARGA } from '../utils/constantes.js';
import { num, paraNumero } from '../utils/format.js';
import { confirmar, escolher, escolherComBusca, formulario, avisar } from '../components/dialogo.js';
import { definirTitulo, abrir, voltarUmaTela, recarregar } from '../navegacao.js';

/* ------------------------------------------------------------------ */
/* Lista                                                               */
/* ------------------------------------------------------------------ */

/**
 * Lista todos os exercícios, com busca.
 * @param {HTMLElement} raiz
 * @returns {Promise<void>}
 */
export async function montarExercicios(raiz) {
  const [lista, musculos] = await Promise.all([
    exercicios.listarExercicios(),
    exercicios.listarMusculos(),
  ]);
  const nomeMusculo = new Map(musculos.map((m) => [m.id, m.nome]));

  raiz.innerHTML = '';

  const busca = document.createElement('input');
  busca.className = 'entrada';
  busca.type = 'search';
  busca.placeholder = 'Buscar exercício…';
  busca.autocomplete = 'off';
  raiz.appendChild(busca);

  const container = document.createElement('div');
  container.style.marginTop = '12px';
  raiz.appendChild(container);

  const semAcento = (t) =>
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();

  const desenharLista = () => {
    const filtro = semAcento(busca.value.trim());
    const visiveis = filtro
      ? lista.filter((e) => semAcento(e.nome).includes(filtro))
      : lista;
    container.innerHTML = '';
    if (!visiveis.length) {
      container.innerHTML = '<div class="vazio">Nenhum exercício encontrado.</div>';
      return;
    }
    visiveis.forEach((ex) => container.appendChild(cardDeExercicio(ex, nomeMusculo)));
  };

  busca.oninput = desenharLista;
  desenharLista();

  const novo = document.createElement('button');
  novo.className = 'btn btn-primario btn-bloco';
  novo.style.marginTop = '12px';
  novo.textContent = '+ novo exercício';
  novo.onclick = () => abrir('exercicio-editor', { novo: true });
  raiz.appendChild(novo);
}

/**
 * Card de um exercício na lista.
 * @param {Object} ex
 * @param {Map<string, string>} nomeMusculo
 * @returns {HTMLElement}
 */
function cardDeExercicio(ex, nomeMusculo) {
  const card = document.createElement('div');
  card.className = 'card card-clicavel';

  const cab = document.createElement('div');
  cab.className = 'card-cabecalho';
  const h3 = document.createElement('h3');
  h3.textContent = ex.nome;
  cab.appendChild(h3);

  const etq = document.createElement('span');
  etq.className = 'etiqueta';
  etq.textContent = ROTULO_CARGA[ex.tipoCarga] ?? 'kg';
  etq.title = NOME_TIPO_CARGA[ex.tipoCarga] ?? '';
  cab.appendChild(etq);
  card.appendChild(cab);

  const p = document.createElement('p');
  p.className = 'texto-fraco pequeno';
  p.style.margin = '0';
  p.textContent = descreverMusculos(ex, nomeMusculo);
  card.appendChild(p);

  card.onclick = () => abrir('exercicio-editor', { exercicioId: ex.id });
  return card;
}

/** "Peito, Tríceps (0,5), Ombro anterior (0,5)" */
function descreverMusculos(ex, nomeMusculo) {
  const lista = ex.musculos ?? [];
  if (!lista.length) return 'Sem músculos definidos — não entra na contagem semanal.';
  return lista
    .map((m) => {
      const nome = nomeMusculo.get(m.musculoId) ?? '?';
      return m.tipo === 'direto' ? nome : `${nome} (${num(m.fracao, 2)})`;
    })
    .join(', ');
}

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

const estado = {
  exercicio: null,
  musculos: [],
  /** Treino que pediu a criação, para já adicionar o exercício nele. */
  treinoId: null,
};

let raizEditor = null;

/**
 * Editor de um exercício (novo ou existente).
 * @param {HTMLElement} elemento
 * @param {{exercicioId?: string, novo?: boolean, treinoId?: string}} params
 * @returns {Promise<void>}
 */
export async function montarEditorDeExercicio(elemento, params) {
  raizEditor = elemento;
  estado.treinoId = params.treinoId ?? null;
  estado.musculos = await exercicios.listarMusculos();

  if (params.novo) {
    const dados = await formulario(
      'Novo exercício',
      [
        { nome: 'nome', rotulo: 'Nome', placeholder: 'Supino inclinado' },
        {
          nome: 'tipoCarga',
          rotulo: 'Tipo de carga',
          tipo: 'select',
          valor: TIPOS_CARGA.CARGA,
          opcoes: Object.values(TIPOS_CARGA).map((t) => ({
            valor: t,
            rotulo: NOME_TIPO_CARGA[t],
          })),
          dica: 'Carga: kg na máquina. Peso corporal: reps e kg a mais. Assistido: kg de assistência (menos é melhor).',
        },
      ],
      'Criar'
    );
    if (!dados || !dados.nome.trim()) {
      await voltarUmaTela();
      return;
    }
    estado.exercicio = await exercicios.criar(dados.nome, dados.tipoCarga);

    if (estado.treinoId) {
      const detalhe = await treinos.buscarTreinoDetalhado(estado.treinoId);
      if (detalhe) await treinos.adicionarItem(detalhe.treino, estado.exercicio.id);
    }
  } else {
    estado.exercicio = await exercicios.buscarExercicio(params.exercicioId);
    if (!estado.exercicio) {
      await voltarUmaTela();
      return;
    }
  }

  desenharEditor();
}

/** Desenha o editor a partir do estado atual. */
function desenharEditor() {
  const ex = estado.exercicio;
  definirTitulo(ex.nome);
  raizEditor.innerHTML = '';

  raizEditor.appendChild(cardIdentidade(ex));
  raizEditor.appendChild(cardMusculos(ex));
  raizEditor.appendChild(botaoExcluir(ex));
}

/** Nome e tipo de carga. */
function cardIdentidade(ex) {
  const card = document.createElement('div');
  card.className = 'card';

  const cab = document.createElement('div');
  cab.className = 'card-cabecalho';
  const h3 = document.createElement('h3');
  h3.textContent = ex.nome;
  cab.appendChild(h3);
  card.appendChild(cab);

  const p = document.createElement('p');
  p.className = 'texto-fraco pequeno';
  p.textContent = `${NOME_TIPO_CARGA[ex.tipoCarga]} — a série registra "${ROTULO_CARGA[ex.tipoCarga]}" e reps.`;
  card.appendChild(p);

  const botao = document.createElement('button');
  botao.className = 'btn btn-bloco';
  botao.textContent = 'Editar nome e tipo';
  botao.onclick = async () => {
    const dados = await formulario('Editar exercício', [
      { nome: 'nome', rotulo: 'Nome', valor: ex.nome },
      {
        nome: 'tipoCarga',
        rotulo: 'Tipo de carga',
        tipo: 'select',
        valor: ex.tipoCarga,
        opcoes: Object.values(TIPOS_CARGA).map((t) => ({
          valor: t,
          rotulo: NOME_TIPO_CARGA[t],
        })),
        dica: 'Mudar o tipo não altera as séries já registradas; muda só o rótulo do campo daqui para frente.',
      },
    ]);
    if (!dados || !dados.nome.trim()) return;
    estado.exercicio = await exercicios.salvar({
      ...ex,
      nome: dados.nome,
      tipoCarga: dados.tipoCarga,
    });
    desenharEditor();
  };
  card.appendChild(botao);
  return card;
}

/** Lista de músculos trabalhados, com tipo e fração. */
function cardMusculos(ex) {
  const card = document.createElement('div');
  card.className = 'card';

  const cab = document.createElement('div');
  cab.className = 'card-cabecalho';
  const h3 = document.createElement('h3');
  h3.textContent = 'Músculos trabalhados';
  cab.appendChild(h3);
  card.appendChild(cab);

  const explica = document.createElement('p');
  explica.className = 'texto-fraco pequeno';
  explica.textContent =
    'Direto conta 1 série. Indireto conta a fração (ex.: 4 séries de supino com tríceps 0,5 contam 2 séries de tríceps).';
  card.appendChild(explica);

  const lista = ex.musculos ?? [];
  if (!lista.length) {
    const vazio = document.createElement('p');
    vazio.className = 'texto-fraco pequeno';
    vazio.textContent = 'Nenhum músculo definido.';
    card.appendChild(vazio);
  }

  const nomes = new Map(estado.musculos.map((m) => [m.id, m.nome]));
  lista.forEach((m) => card.appendChild(linhaDeMusculo(ex, m, nomes)));

  const add = document.createElement('button');
  add.className = 'btn btn-bloco';
  add.style.marginTop = '10px';
  add.textContent = '+ músculo';
  add.onclick = () => adicionarMusculo(ex);
  card.appendChild(add);

  return card;
}

/** Uma linha de músculo: nome, tipo/fração e remover. */
function linhaDeMusculo(ex, m, nomes) {
  const linha = document.createElement('div');
  linha.className = 'linha-musculo';

  const nome = document.createElement('span');
  nome.textContent = nomes.get(m.musculoId) ?? 'Músculo removido';
  linha.appendChild(nome);

  const tipo = document.createElement('button');
  tipo.className = 'pilula';
  tipo.setAttribute('aria-pressed', String(m.tipo === 'direto'));
  tipo.textContent = m.tipo === 'direto' ? 'direto' : `indireto ${num(m.fracao, 2)}`;
  tipo.title = 'Alternar entre direto e indireto';
  tipo.onclick = () => editarMusculo(ex, m);
  linha.appendChild(tipo);

  const remover = document.createElement('button');
  remover.className = 'btn btn-icone';
  remover.textContent = '×';
  remover.setAttribute('aria-label', 'Remover músculo');
  remover.onclick = async () => {
    estado.exercicio = await exercicios.salvar({
      ...ex,
      musculos: ex.musculos.filter((x) => x.musculoId !== m.musculoId),
    });
    desenharEditor();
  };
  linha.appendChild(remover);

  return linha;
}

/** Diálogo de tipo e fração de um músculo já ligado ao exercício. */
async function editarMusculo(ex, m) {
  const dados = await formulario(
    estado.musculos.find((x) => x.id === m.musculoId)?.nome ?? 'Músculo',
    [
      {
        nome: 'tipo',
        rotulo: 'Como este exercício trabalha o músculo',
        tipo: 'select',
        valor: m.tipo,
        opcoes: [
          { valor: 'direto', rotulo: 'Direto (conta 1 série)' },
          { valor: 'indireto', rotulo: 'Indireto (conta uma fração)' },
        ],
      },
      {
        nome: 'fracao',
        rotulo: 'Fração, se indireto',
        tipo: 'number',
        valor: num(m.fracao ?? 0.5, 2),
        dica: 'Entre 0 e 1. Ignorado quando o músculo é direto.',
      },
    ]
  );
  if (!dados) return;

  const musculos = ex.musculos.map((x) =>
    x.musculoId === m.musculoId
      ? { ...x, tipo: dados.tipo, fracao: paraNumero(dados.fracao) ?? 0.5 }
      : x
  );
  estado.exercicio = await exercicios.salvar({ ...ex, musculos });
  desenharEditor();
}

/** Escolhe um músculo e o acrescenta ao exercício. */
async function adicionarMusculo(ex) {
  const jaTem = new Set((ex.musculos ?? []).map((m) => m.musculoId));
  const opcoes = estado.musculos
    .filter((m) => !jaTem.has(m.id))
    .map((m) => ({ valor: m.id, rotulo: m.nome }));

  if (!opcoes.length) {
    await avisar(
      'Sem músculos disponíveis',
      'Todos os músculos cadastrados já estão neste exercício. Crie outros na tela Músculos.'
    );
    return;
  }

  const musculoId = await escolherComBusca('Adicionar músculo', opcoes);
  if (!musculoId) return;

  const tipo = await escolher('Como trabalha esse músculo?', [
    { valor: 'direto', rotulo: 'Direto', detalhe: 'conta 1' },
    { valor: 'indireto', rotulo: 'Indireto', detalhe: 'conta 0,5' },
  ]);
  if (!tipo) return;

  estado.exercicio = await exercicios.salvar({
    ...ex,
    musculos: [...(ex.musculos ?? []), { musculoId, tipo, fracao: tipo === 'direto' ? 1 : 0.5 }],
  });
  desenharEditor();
}

/** Excluir o exercício, avisando onde ele é usado. */
function botaoExcluir(ex) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-perigo btn-bloco';
  btn.style.marginTop = '8px';
  btn.textContent = 'Excluir exercício';
  btn.onclick = async () => {
    const uso = await exercicios.ondeEUsado(ex.id);
    const partes = [];
    if (uso.treinos.length) {
      const nomes = [...new Set(uso.treinos.map((u) => 'Treino ' + u.treinoNome))];
      partes.push(`Ele está em: ${nomes.join(', ')}. Vai sair desses treinos.`);
    }
    if (uso.series) {
      partes.push(
        `Existem ${uso.series} séries registradas com ele. O histórico não é apagado, mas o exercício some do nome nas telas.`
      );
    }
    if (!partes.length) partes.push('Ele não está em nenhum treino nem tem histórico.');

    const ok = await confirmar('Excluir ' + ex.nome + '?', partes.join(' '));
    if (!ok) return;
    await exercicios.excluir(ex.id);
    await voltarUmaTela();
    await recarregar();
  };
  return btn;
}
