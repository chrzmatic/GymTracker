# Bibliotecas de terceiros

A especificação pede as bibliotecas **salvas localmente, sem CDN**, para o app
funcionar offline. Este arquivo registra de onde cada uma veio e como conferir
que o arquivo aqui é o mesmo que foi publicado.

## Chart.js

| | |
|---|---|
| Arquivo | `chart.umd.min.js` |
| Versão | 4.5.1 |
| Licença | MIT (`chart.js-LICENSE.md`) |
| Baixado em | 2026-09-21 |
| Tamanho | 208.522 bytes |
| SHA-256 | `48444a82d4edcb5bec0f1965faacdde18d9c17db3063d042abada2f705c9f54a` |

Origem (os dois entregaram bytes idênticos):

- <https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js>
- <https://unpkg.com/chart.js@4.5.1/dist/chart.umd.min.js>

### Por que a build UMD

O projeto não tem etapa de build. A build ESM do Chart.js importa
`@kurkle/color` como dependência separada, o que exigiria um empacotador ou um
import map. A UMD já vem com tudo dentro e define `window.Chart` ao carregar —
é a única que funciona com um `<script>` simples.

Escolhi a versão minificada porque ela vai para o cache do service worker no
iPhone: 208 KB contra 546 KB da não-minificada.

### O que foi conferido antes de entrar no projeto

- Os dois CDNs entregaram o **mesmo SHA-256**, o que torna muito improvável
  uma adulteração em trânsito ou num espelho.
- O banner declara `Chart.js v4.5.1`, e o código executado reporta
  `Chart.version === '4.5.1'`.
- Parseia sem erro de sintaxe e exporta uma função `Chart` utilizável.
- Nenhuma chamada de rede no arquivo: zero ocorrências de `fetch(`,
  `XMLHttpRequest`, `eval(`, `document.write` e `importScripts`. As duas únicas
  URLs presentes estão em comentários de banner (chartjs.org e o repositório do
  `@kurkle/color`, que vem embutido).

### Como reverificar

```powershell
cd <pasta do projeto>
Get-FileHash lib\chart.umd.min.js -Algorithm SHA256
```

O resultado tem que ser o SHA-256 da tabela acima.

### Ao atualizar a versão

Repetir o mesmo roteiro: baixar dos dois CDNs, comparar os hashes entre si,
conferir o banner e a ausência de chamadas de rede, e **atualizar esta tabela**.
O `chart.umd.min.js.map` não é baixado de propósito — serve só para depurar e
pesaria no cache offline.
