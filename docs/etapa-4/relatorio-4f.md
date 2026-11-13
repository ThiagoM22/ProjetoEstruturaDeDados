# ED Viz — Etapa 4F
## Sheets responsivas e movimento do Caderno

**Data:** 13/11/2026  
**Branch:** `redesign/etapa-1-baseline`  
**Escopo:** comportamento das folhas de Código e Margem em ≤1023px, limite na Régua e movimento de abertura/fechamento  
**Status:** concluída

> Esta etapa mexe apenas na geometria e no movimento das folhas. O interpretador, os renderizadores, a câmera, o playback e a Régua não foram alterados.

---

## 1. Geometria final

| Recorte | Código | Margem |
|---|---|---|
| ≥1200px | Coluna de 430px quando a Margem está aberta | Coluna de 300–372px |
| 1024–1199px | Coluna do Roteiro | Folha sobre o palco, terminando no topo da Régua |
| 901–1023px | Folha sobre o palco | Folha sobre o palco, terminando no topo da Régua |
| ≤900px | Folha de largura total, terminando no topo da Régua | Folha de largura total, terminando no topo da Régua |

A largura total em ≤900px elimina a faixa residual de 8vw. O fechar continua no cabeçalho de cada folha; o Histórico permanece acessível na Régua.

## 2. Movimento

- Entrada de 240ms com `ease-out`; saída de 200ms com aceleração.
- A grade do Caderno anima junto: a Prancha cede ou recupera largura na mesma batida.
- O conteúdo da folha é ancorado à largura final para o código não refluir durante o gesto.
- Arrastar a divisória, redimensionar a janela e o ajuste de fonte continuam diretos.
- Em `prefers-reduced-motion`, a troca é instantânea.
- Abrir uma folha abaixo de 1200px fecha a outra na mesma transição.

## 3. Correções de suporte

- `overflow: hidden` no `.layout` contém as folhas recolhidas deslocadas por `transform` e elimina a rolagem horizontal no mobile.
- O `.code-panel` mantém `container-type: inline-size` para o atalho do rodapé; o `.code-head` tem o próprio container para as abas não refluírem no movimento.
- `ResizeObserver` no textarea mantém o controle **“ver o resto →”** sincronizado com a largura final do editor.

## 4. Verificação

- Em 390px: folhas com largura 390, base em 750 e Régua começando em 750.
- Em 768px: folhas de largura total, Régua descoberta.
- Em 1440px: 430px de Código · 634px de Prancha · 372px de Margem.
- `npm test`: 214 testes de núcleo + 90 de UI + 9 de conteúdo.
- `npm run test:e2e`: 133 passando, 1 skip, em Chromium e Firefox.

## 5. Capturas

- [`4f-390-codigo.png`](4f-390-codigo.png)
- [`4f-390-margem.png`](4f-390-margem.png)
- [`4f-768-codigo.png`](4f-768-codigo.png)
- [`4f-768-margem.png`](4f-768-margem.png)
