/**
 * Teste da migração do banco, num navegador de verdade.
 *
 * O app vai ser usado enquanto é construído, então cada mudança de estrutura
 * precisa preservar o que já está gravado. Este teste monta um banco na
 * versão antiga, com dados dentro, abre o app e confere que nada se perdeu.
 *
 *   deno run -A tests/navegador/migracao-integracao.js
 */

import { conectar, lancarNavegador, servir } from './cdp.js';

const raiz = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PORTA_DEVTOOLS = 9224;

/* Roda dentro da página, numa aba em branco: o app ainda não abriu o banco. */
const cenario = String.raw`
(async () => {
  const log = [];
  const ok = (nome, real, esperado) =>
    log.push({ nome, passou: JSON.stringify(real) === JSON.stringify(esperado), real, esperado });

  const req = (r) => new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

  /* --- 1. cria o banco na versão 1, com a numeração antiga --- */
  await new Promise((res, rej) => {
    const abrir = indexedDB.open('gymtracker', 1);
    abrir.onupgradeneeded = () => {
      const db = abrir.result;
      db.createObjectStore('musculos', { keyPath: 'id' });
      db.createObjectStore('exercicios', { keyPath: 'id' });
      db.createObjectStore('treinos', { keyPath: 'id' });
      const sessoes = db.createObjectStore('sessoes', { keyPath: 'id' });
      sessoes.createIndex('data', 'data');
      sessoes.createIndex('status', 'status');
      sessoes.createIndex('treinoId', 'treinoId');
      const series = db.createObjectStore('series', { keyPath: 'id' });
      series.createIndex('sessaoId', 'sessaoId');
      series.createIndex('exercicioId', 'exercicioId');
      const pesos = db.createObjectStore('pesoCorporal', { keyPath: 'id' });
      pesos.createIndex('data', 'data');
      db.createObjectStore('config', { keyPath: 'chave' });
    };
    abrir.onsuccess = () => {
      const db = abrir.result;
      const tx = db.transaction(['sessoes', 'series'], 'readwrite');
      tx.objectStore('sessoes').put({
        id: 'ses-velha',
        data: '2026-09-20',
        treinoId: 'tr-a',
        treinoNome: 'A',
        status: 'finalizada',
        criadaEm: 1,
        itens: [{ itemId: 'it-1', ordem: 0, tipo: 'exercicio', exercicioId: 'ex-supino' }],
      });
      const s = tx.objectStore('series');
      // Numeração antiga: aquecimento dividia a sequência com as séries
      // valendo e tinha sido adicionado por último (numero 4).
      s.put({ id: 'v1', sessaoId: 'ses-velha', itemId: 'it-1', ordemItem: 0, exercicioId: 'ex-supino', numero: 1, carga: 14, reps: 12, aquecimento: false });
      s.put({ id: 'v2', sessaoId: 'ses-velha', itemId: 'it-1', ordemItem: 0, exercicioId: 'ex-supino', numero: 2, carga: 16, reps: 8, aquecimento: false });
      s.put({ id: 'v3', sessaoId: 'ses-velha', itemId: 'it-1', ordemItem: 0, exercicioId: 'ex-supino', numero: 3, carga: 16, reps: 6, aquecimento: false });
      s.put({ id: 'v4', sessaoId: 'ses-velha', itemId: 'it-1', ordemItem: 0, exercicioId: 'ex-supino', numero: 4, carga: 8, reps: 20, aquecimento: true });
      tx.oncomplete = () => { db.close(); res(); };
      tx.onerror = () => rej(tx.error);
    };
    abrir.onerror = () => rej(abrir.error);
  });

  /* --- 2. abre pelo app, o que dispara a migração --- */
  const db = await import('/js/data/db.js');
  ok('o app está na versão 3 do banco', db.VERSAO_DB, 3);

  const svc = await import('/js/services/sessao-service.js');
  const carregada = await svc.carregarSessao('ses-velha');

  ok('a sessão antiga continua lá', carregada.sessao.id, 'ses-velha');
  ok('nenhuma série foi perdida', carregada.series.length, 4);
  ok(
    'as cargas registradas continuam iguais',
    carregada.series.map((s) => s.carga + 'x' + s.reps).sort(),
    ['14x12', '16x6', '16x8', '8x20'].sort()
  );
  ok(
    'o aquecimento foi renumerado à parte e passou para o começo',
    carregada.series.map((s) => (s.aquecimento ? 'aq' : 'ok') + s.numero),
    ['aq1', 'ok1', 'ok2', 'ok3']
  );
  ok(
    'a ordem das séries valendo foi preservada',
    carregada.series.filter((s) => !s.aquecimento).map((s) => s.id),
    ['v1', 'v2', 'v3']
  );

  /* --- 3. a v3 acrescenta a dieta sem tocar no treino --- */
  const seed = await import('/js/services/seed-service.js');
  const dietaRepo = await import('/js/data/dieta-repo.js');

  ok('o banco antigo nao tinha dieta', (await dietaRepo.listarAlimentos()).length, 0);
  await seed.carregarSeNecessario();
  ok('a carga inicial traz a dieta', (await dietaRepo.listarAlimentos()).length > 0, true);
  ok('e nao duplica o treino que ja existia', (await svc.listarSessoes()).length, 1);
  ok('as series continuam intactas depois da carga', (await svc.seriesDaSessao('ses-velha')).length, 4);

  return log;
})()
`;

const servidor = servir(raiz.replace(/\/$/, ''));
const navegador = await lancarNavegador({
  url: `http://localhost:${servidor.porta}/__vazio`,
  porta: PORTA_DEVTOOLS,
});

let codigoSaida = 1;
// Declarado fora do try para o finally conseguir fechar o navegador pelo
// protocolo, que e o unico jeito confiavel de soltar o perfil temporario.
let cdp = null;
try {
  cdp = await conectar(PORTA_DEVTOOLS);
  await cdp.enviar('Page.enable');
  await cdp.enviar('Runtime.enable');

  // Garante que estamos na página do servidor (e não na aba inicial em
  // branco, onde o navegador não deixa usar IndexedDB).
  const alvo = `http://localhost:${servidor.porta}/__vazio`;
  for (let i = 0; i < 40; i += 1) {
    const url = await cdp.avaliar('location.href');
    if (url === alvo) break;
    await cdp.enviar('Page.navigate', { url: alvo });
    await new Promise((r) => setTimeout(r, 250));
  }

  const log = await cdp.avaliar(cenario);
  const falhas = log.filter((t) => !t.passou);
  log.forEach((t) => {
    if (t.passou) return console.log(`  ok    ${t.nome}`);
    console.log(`  FALHA ${t.nome}`);
    console.log(`        esperado: ${JSON.stringify(t.esperado)}`);
    console.log(`        obtido:   ${JSON.stringify(t.real)}`);
  });
  console.log(`\n${log.length - falhas.length} passaram | ${falhas.length} falharam`);
  codigoSaida = falhas.length ? 1 : 0;
} catch (erro) {
  console.error('Erro:', erro.message);
} finally {
  await navegador.encerrar(cdp);
  await servidor.parar();
  Deno.exit(codigoSaida);
}
