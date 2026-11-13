# ED Viz — Etapa 4D
## Prancha e Régua

**Data:** 13/11/2026  
**Branch:** `redesign/etapa-1-baseline`  
**Escopo:** legenda da Prancha, seletor de estrutura, banner de erro dentro da Prancha, preservação do último desenho válido e retorno ao palco ao executar no mobile  
**Status:** concluída

> A geometria dos renderizadores, as estruturas, o interpretador e a Régua existente não foram alterados. A 4D reorganiza o chrome da Prancha e o lugar do erro.

---

## 1. O que mudou

### Seletor de estrutura na legenda
- A partir de **1024px**, `#structureSelect` vive na legenda da Prancha, ao lado do estado e da câmera.
- Quando a Prancha fica menor que **600px** — por exemplo, 1200px com a Margem aberta, Prancha de 480px — o seletor volta para a topbar para não esmagar título, contagem e operação.
- Abaixo de 1024px, o seletor permanece na topbar.
- O nó, o `id`, o listener e o nome acessível são os mesmos; apenas o ponto de montagem muda.

### Banner dentro da Prancha
- `#banner` saiu do nível global e passou para dentro de `#vizPanel`, abaixo do cabeçalho.
- A faixa de erro acompanha a largura da Prancha, não a viewport inteira.
- `role="alert"`, `aria-live="assertive"` e o vínculo com o editor foram preservados.

### Erro preserva o último desenho válido
- Com um trace que falha depois de alguns passos, a Prancha continua mostrando a última estrutura válida; o banner explica a linha e a mensagem.
- Quando o erro acontece antes de qualquer passo, o palco mantém o estado vazio orientativo “Corrija o erro e execute de novo.”.

### Executar no mobile
- Em telas menores que 1024px, executar a partir da folha de código fecha a folha antes de mostrar o resultado.
- Isso evita que a folha esconda o banner e o desenho, e mantém a regra de uma superfície por vez.

## 2. Geometria verificada

| Viewport | Prancha | Seletor | Observação |
|---|---:|---|---|
| 1440, Margem aberta | 634px | Legenda | Título, contagem, operação, estado e câmera |
| 1024 | 660px | Legenda | Roteiro em coluna; Margem em folha |
| 1200, Margem aberta | 480px | Topbar | Evita esmagar a identificação |
| 768 | 768px | Topbar | Prancha inteira |
| 390 | 390px | Topbar | Executar fecha a folha de código |

## 3. Comportamento do erro

- O banner ocupa uma faixa de 33px dentro da Prancha.
- A estrutura anterior continua visível e navegável.
- O passo final, a linha atual e a Régua permanecem sincronizados.
- O desenho não é substituído pela mensagem de erro quando há um estado válido anterior.

## 4. Verificação

- `npm test`: **214 núcleo + 90 UI + 9 conteúdo**.
- `npm run test:e2e`: **137 passando, 1 skip**, em Chromium e Firefox.
- Novas regressões:
  - seletor e banner pertencem à Prancha em 1440;
  - erro preserva o desenho;
  - no 390, executar pela folha fecha o código e mostra o banner;
  - seletor volta à topbar quando a Prancha fica estreita.

## 5. Capturas

- [`4d-1440-erro.png`](4d-1440-erro.png)
- [`4d-1024.png`](4d-1024.png)
- [`4d-1200-margem.png`](4d-1200-margem.png)
- [`4d-390.png`](4d-390.png)
