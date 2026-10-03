/** Diálogos: confirmar, escolher, formulário e aviso. */

/** Abre um <dialog> e resolve com o valor passado a `fechar`. */
function abrir(montar) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal';
    let valor = null;
    const fechar = (v) => {
      valor = v;
      dlg.close();
    };
    dlg.addEventListener('close', () => {
      dlg.remove();
      resolve(valor);
    });
    montar(dlg, fechar);
    document.body.appendChild(dlg);
    dlg.showModal();
  });
}

/**
 * Pede confirmação antes de uma ação destrutiva.
 * @returns {Promise<boolean>}
 */
export function confirmar(titulo, mensagem = '', textoConfirmar = 'Excluir') {
  return abrir((dlg, fechar) => {
    dlg.innerHTML = `
      <h2></h2>
      <p class="texto-fraco"></p>
      <div class="linha-botoes">
        <button class="btn" data-acao="cancelar">Cancelar</button>
        <button class="btn btn-perigo" data-acao="ok"></button>
      </div>`;
    dlg.querySelector('h2').textContent = titulo;
    const p = dlg.querySelector('p');
    p.textContent = mensagem;
    if (!mensagem) p.classList.add('oculto');
    dlg.querySelector('[data-acao="ok"]').textContent = textoConfirmar;
    dlg.querySelector('[data-acao="ok"]').onclick = () => fechar(true);
    dlg.querySelector('[data-acao="cancelar"]').onclick = () => fechar(false);
  });
}

/**
 * Lista de opções. Devolve o valor escolhido, ou null se cancelar.
 * @param {string} titulo
 * @param {{valor: *, rotulo: string, detalhe?: string}[]} opcoes
 */
export function escolher(titulo, opcoes) {
  return abrir((dlg, fechar) => {
    dlg.innerHTML = `
      <h2></h2>
      <ul class="lista-simples"></ul>
      <button class="btn btn-bloco" data-acao="cancelar">Cancelar</button>`;
    dlg.querySelector('h2').textContent = titulo;
    const ul = dlg.querySelector('ul');
    opcoes.forEach((op) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'btn btn-bloco btn-esquerda';
      btn.textContent = op.rotulo;
      if (op.detalhe) {
        const span = document.createElement('span');
        span.className = 'texto-fraco pequeno empurra-direita';
        span.textContent = op.detalhe;
        btn.appendChild(span);
      }
      btn.onclick = () => fechar(op.valor);
      li.appendChild(btn);
      ul.appendChild(li);
    });
    dlg.querySelector('[data-acao="cancelar"]').onclick = () => fechar(null);
  });
}

/**
 * Como `escolher`, com campo de busca para listas longas.
 * @param {string} titulo
 * @param {{valor: *, rotulo: string, detalhe?: string}[]} opcoes
 * @param {string} [textoVazio] quando a busca não acha nada
 */
export function escolherComBusca(titulo, opcoes, textoVazio = 'Nada encontrado.') {
  return abrir((dlg, fechar) => {
    dlg.innerHTML = `
      <h2></h2>
      <input class="entrada" type="search" placeholder="Buscar…" autocomplete="off" />
      <ul class="lista-simples lista-rolavel"></ul>
      <button class="btn btn-bloco" data-acao="cancelar">Cancelar</button>`;
    dlg.querySelector('h2').textContent = titulo;
    const busca = dlg.querySelector('input');
    const ul = dlg.querySelector('ul');

    const semAcento = (t) =>
      t
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();

    const desenhar = () => {
      const filtro = semAcento(busca.value.trim());
      const visiveis = filtro
        ? opcoes.filter((o) => semAcento(o.rotulo).includes(filtro))
        : opcoes;
      ul.innerHTML = '';
      if (!visiveis.length) {
        const li = document.createElement('li');
        li.className = 'texto-fraco pequeno';
        li.textContent = textoVazio;
        ul.appendChild(li);
        return;
      }
      visiveis.forEach((op) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.className = 'btn btn-bloco btn-esquerda';
        btn.textContent = op.rotulo;
        if (op.detalhe) {
          const span = document.createElement('span');
          span.className = 'texto-fraco pequeno empurra-direita';
          span.textContent = op.detalhe;
          btn.appendChild(span);
        }
        btn.onclick = () => fechar(op.valor);
        li.appendChild(btn);
        ul.appendChild(li);
      });
    };

    busca.oninput = desenhar;
    desenhar();
    dlg.querySelector('[data-acao="cancelar"]').onclick = () => fechar(null);
  });
}

/**
 * Formulário curto. Devolve os valores, ou null se cancelar.
 *
 * Tipos de campo: os do HTML, mais `textarea`, `select` (com `opcoes`),
 * `checkbox` (devolve booleano) e `link`.
 *
 * @param {string} titulo
 * @param {{nome: string, rotulo: string, tipo?: string, valor?: *, placeholder?: string, opcoes?: {valor: *, rotulo: string}[], dica?: string}[]} campos
 * @param {string} [textoOk]
 */
export function formulario(titulo, campos, textoOk = 'Salvar') {
  return abrir((dlg, fechar) => {
    dlg.innerHTML = `
      <h2></h2>
      <form method="dialog"></form>
      <div class="linha-botoes">
        <button class="btn" data-acao="cancelar">Cancelar</button>
        <button class="btn btn-primario" data-acao="ok"></button>
      </div>`;
    dlg.querySelector('h2').textContent = titulo;
    const form = dlg.querySelector('form');
    campos.forEach((c) => form.appendChild(montarCampo(c)));

    const ok = dlg.querySelector('[data-acao="ok"]');
    ok.textContent = textoOk;
    ok.onclick = () => {
      const dados = {};
      campos.forEach((c) => {
        if (c.tipo === 'link') return; // não é campo, não tem valor
        const el = form.querySelector(`[name="${c.nome}"]`);
        dados[c.nome] = c.tipo === 'checkbox' ? el.checked : el.value;
      });
      fechar(dados);
    };
    dlg.querySelector('[data-acao="cancelar"]').onclick = () => fechar(null);

    const primeiro = form.querySelector('input:not([type="checkbox"]), textarea');
    if (primeiro) setTimeout(() => primeiro.focus(), 50);
  });
}

/** Uma linha do formulário, conforme o tipo do campo. */
function montarCampo(c) {
  const linha = document.createElement('div');
  linha.className = 'form-linha';

  // Um <a> de verdade: o Safari só abre aba dentro do toque, e um
  // window.open depois de um await é bloqueado sem aviso.
  if (c.tipo === 'link') {
    const a = document.createElement('a');
    a.className = 'btn btn-bloco';
    a.href = c.href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = c.rotulo;
    linha.appendChild(a);
    if (c.dica) linha.appendChild(dicaDoCampo(c.dica));
    return linha;
  }

  if (c.tipo === 'checkbox') {
    const label = document.createElement('label');
    label.className = 'form-checkbox';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = c.nome;
    input.checked = Boolean(c.valor);
    const texto = document.createElement('span');
    texto.textContent = c.rotulo;
    label.append(input, texto);
    linha.appendChild(label);
    if (c.dica) linha.appendChild(dicaDoCampo(c.dica));
    return linha;
  }

  const label = document.createElement('label');
  label.textContent = c.rotulo;
  label.htmlFor = `campo-${c.nome}`;

  let campo;
  if (c.tipo === 'select') {
    campo = document.createElement('select');
    (c.opcoes ?? []).forEach((op) => {
      const opt = document.createElement('option');
      opt.value = op.valor;
      opt.textContent = op.rotulo;
      campo.appendChild(opt);
    });
  } else if (c.tipo === 'textarea') {
    campo = document.createElement('textarea');
  } else {
    campo = document.createElement('input');
    campo.type = c.tipo ?? 'text';
    if (c.tipo === 'number') campo.inputMode = 'decimal';
  }

  campo.className = 'entrada';
  campo.id = `campo-${c.nome}`;
  campo.name = c.nome;
  if (c.placeholder) campo.placeholder = c.placeholder;
  if (c.valor !== undefined && c.valor !== null) campo.value = c.valor;

  linha.append(label, campo);
  if (c.dica) linha.appendChild(dicaDoCampo(c.dica));
  return linha;
}

/** Texto explicativo abaixo de um campo. */
function dicaDoCampo(texto) {
  const p = document.createElement('p');
  p.className = 'texto-fraco pequeno m-0 mt-1';
  p.textContent = texto;
  return p;
}

/** Mensagem com um botão OK. */
export function avisar(titulo, mensagem) {
  return abrir((dlg, fechar) => {
    dlg.innerHTML = `
      <h2></h2>
      <p class="texto-fraco"></p>
      <button class="btn btn-primario btn-bloco" data-acao="ok">OK</button>`;
    dlg.querySelector('h2').textContent = titulo;
    dlg.querySelector('p').textContent = mensagem;
    dlg.querySelector('[data-acao="ok"]').onclick = () => fechar(true);
  });
}
