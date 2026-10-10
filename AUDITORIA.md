# Auditoria ED Viz — Relatório Final

- **Data:** 09–10/10/2026
- **Commit auditado:** 89185f9 (branch `main`, working tree limpo)
- **Ambiente:** Windows · Node v24.16.0 · npm 11.13.0
- **Método:** inspeção estática + execução de testes + sondagens fora do repositório (`C:\Users\DEV\AppData\Local\Temp\opencode\edviz-probe{,2,3,4,5}.js`) + tentativa de teste em navegador real (indisponível nesta sessão).
- **Nada foi alterado no repositório durante a auditoria.**

**Legenda:** [F] fato lido no código · [T] resultado de teste · [I] inferência · [R] recomendação · [NV] não validado (sem navegador real).

## Decisões tomadas pelo autor (10/10/2026)

1. **Deploy:** Vercel (estático).
2. **Divergências semânticas:** corrigir todas (EU-03, EU-04, EU-05, EU-10, EU-11, EU-14).
3. **Limite de passos:** manter 20.000.
4. **Buffer por aba:** entra no escopo do MVP (EU-09).
5. **Touch/mobile:** fora do escopo (somente desktop Chromium + Firefox).
6. **Automação de navegador:** autorizada (Playwright).
7. **Relatório:** salvo neste arquivo.

---

## 1. Resumo executivo

ED Viz está funcionalmente completo e muito bem testado (193 testes de núcleo + 79 de UI, 0 falhas). Interpretador isolado (sem `eval`/`Function`), renderização das estruturas com escape de HTML do usuário (verificado com payload real), histórico por snapshots serializados imutáveis. Sem bloqueadores (P0). Três defeitos P1 antes do deploy público: EU-01 (debug edita o código), EU-02 (trace obsoleto após edição), EU-03 (igualdade frouxa entre objetos). Divergências de fidelidade do interpretador mapeadas e diferencialmente testadas (25/31 casos idênticos ao Node). Risco de memória em traces extremos (~198 MB/18k passos; exemplos reais ≤3 MB).

## 2. Mapa da arquitetura

App estático, sem build, sem dependências; 9 scripts clássicos (IIFE → namespace `DSV`). Módulos: `util` (escape/formatação/resolução de expressão), `tokenizer`+`parser` (AST com linha), `interpreter` (Runtime, steps serializados, eventos, limites 20k/500), `examples` (16), `anim` (FLIP/WAAPI + reducedMotion), `rough` (traço à mão próprio), `views` (detecção heurística + renderizadores + cena de árvore), `app` (estado/playback/editor/painéis/hover/zoom/debug/localStorage), `servidor.js` (dev), `tests` (runners caseiros com DOM simulado).

Fluxo: editor → `run()` → `DSV.interpret` → `trace {steps, output, error}` → `goto(i)` re-renderiza o passo i (estrutura, chamadas, variáveis, saída, comandos). `opsMap`/visitas calculados 1× por execução.

Histórico: cada passo serializa `globals/locals/pointers/stack/thisVal` no momento; reordenação por `__seq`; navegação por índice; snapshots imutáveis [T].

Nova estrutura: vocabulário/`considerX` + `TYPE_RANK` (views.js), renderizador + despacho, explicação, testes; override manual no seletor “Visualização”.

## 3. Matriz das sete estruturas

| Estrutura | Lógica | Visualização | Histórico | Testes | Problemas |
|---|---|---|---|---|---|
| Array (MeuArray) | Validado [T] (loops manuais preservados) | Validado [T] | Validado [T] | Forte | EU-05/EU-10 (interpretador geral) |
| Pilha | Validado [T] (`topo()`, `estaVazia()`) | Validado [T] | Validado [T] | Bom | — |
| Fila | Validado [T] (FIFO, janela `#inicio/#fim`) | Validado [T] | Validado [T] | Forte | [I] FRONT/REAR no modo janela com unshift/pop [NV] |
| Lista simples | Validado [T] | Validado [T] | Validado [T] | Forte | [I] wrapper “Lista*” não cai no ramo MeuArray |
| Lista dupla | Validado [T] (invariantes prev/next) | Validado [T] | Validado [T] | Forte | — |
| Árvore simples | Validado [T] (BFS, não-BST) | Validado [T] | Validado [T] | Forte | candidatos `tree` duplicados; render static/scene duplicados |
| BST | Validado [T] (#root, remoção 3 casos, duplicados) | Validado [T] | Validado [T] | Forte | — |

## 4. Executor e histórico

Corretos [F/T]: eventos reais, ordem cronológica por `__seq`, limites com mensagens pedagógicas, erros com linha, recursos não suportados com mensagem clara.

Diferencial contra o Node [T] (25/31 iguais): `[1]==[1]`/`{}=={}` → true (EU-03); `fill(9,1,2)` → [9,9,9] (EU-05); `a[i++]+=1` → i=2/a=[10,11] (EU-04); `a.length=3` → 3 chaves (EU-10); `new C(g())` → campo antes do arg (EU-11); `parseInt("0x10")` → 0 (EU-14); `return` no topo → “[object Object]” (EU-13).

Isolamento [T]: `window/process/globalThis/require` undefined; `__proto__` contido; `JSON.stringify` de buracos ok.

Memória [T]: 18k passos ≈ 198 MB heap / 61 MB JSON; maior exemplo 972 passos ≈ 3 MB; 16 exemplos = 3.748 passos / ~140 ms de render (Node).

Riscos: EU-02 (trace obsoleto), EU-07 (FLIP sem cancelamento [NV]), EU-20 (metadata sticky/forced obsoleta).

## 5. UX

Defeitos: EU-01, EU-02, EU-08 (abas sem teclado), EU-09 (sem buffer por aba), seletor só do último passo. Pontos fortes: estados vazios, faixa explicativa, painéis, atalhos com guarda de foco, reduced-motion (CSS+JS), breakpoints 1500/1100/720, focus-visible, ARIA. [NV]: contraste, sobreposição visual, select customizável, touch, animações sob stepping rápido, Lighthouse.

## 6. Arquitetura e qualidade

Riscos [F/I]: duplicação static/scene da árvore; `listInfo`×`listChain`; constantes CSS/JS duplicadas; estado derivado (errorLine, traceCode, candidates); `renderCommands` O(eventos) por passo; localStorage a cada tecla; startDebug com render duplo; código morto (`identifierAt` só em testes, `childNodeProp`, `countList`, `cell`, CSS `ptr-chip-*`).

## 7. Segurança

Sem P0. XSS baixo: payload `<img onerror>` renderizado escapado [T]; esc em app/view [F]. `renderMessage` cru (chamadores seguros) — contrato frágil (EU-17). Interpretador isolado [T]. Limites ok; memória em teto (EU-06). `servidor.js` escuta 0.0.0.0 [F] (EU-18). Sem segredos, sem deps, sem CDN.

## 8. Testes e build

`npm test` → 193 + 79, 0 falhas [T]. Probes 1–5 executados [T]. Cobertura ausente: navegador real/cross-browser, regressão visual, performance/memória automatizada, bateria diferencial permanente, casos EU-01/02/03/04/05/10/11, acessibilidade por teclado, `file://`.

## 9. Deploy

Alvo: **Vercel** (estático). Confirmado: sem build/back/BD/env/HTTPS obrigatório; caminhos relativos; rollback via git. Pendente: validação real em navegador, CSP/cache, `.vercelignore`, docs de deploy, correção do help (150→500), suíte e2e.

## 10. Lista priorizada

- **P0:** nenhum.
- **P1:** EU-01 (debug edita código), EU-02 (trace obsoleto), EU-03 (igualdade frouxa entre objetos).
- **P2:** EU-04 (alvo reavaliado 2×), EU-05 (fill start/end), EU-06 (memória no teto — manter 20k, medir no navegador), EU-07 (FLIP sem cancelamento [NV]), EU-08 (abas sem teclado), EU-09 (buffer por aba — EM ESCOPO), EU-10 (length/jump sem buracos), EU-11 (new: ordem args/campos).
- **P3:** EU-13 (mensagens), EU-14 (`parseInt` hex), EU-15 (help 150 vs 500), EU-16 (código morto), EU-17 (`renderMessage`), EU-18 (bind/CSP), EU-19 (cache de largura/constantes), EU-20 (metadata obsoleta), EU-21 (slider no estado vazio), EU-22 (wheel no canvas — decisão de UX).

Evidências, arquivos e linhas por item: ver entrega da auditoria na conversa (sessão `ses_edc5a569effe54Ys2rfefDlB6p`).

## 11. Plano de correção

- **A — Bloqueadores:** vazia.
- **B — Funcional:** EU-01, EU-02, EU-03, EU-04, EU-05, EU-10, EU-11, EU-14. Validação: `npm test` + bateria diferencial.
- **C — Confiabilidade:** bateria diferencial permanente; testes EU-01/EU-02; Playwright (Chromium+Firefox) com checklist; memória no navegador; `file://`.
- **D — UX:** EU-08, EU-09, EU-13, EU-15, EU-17, EU-20, EU-21.
- **E — Produção (Vercel):** `vercel.json` (CSP/cache), `.vercelignore`, README de deploy, bind 127.0.0.1 no servidor dev.

## 12. Critérios de pronto

| Dimensão | Critério | Status na auditoria |
|---|---|---|
| Funcionalidade | 16 exemplos + estruturas verdes | ✅ |
| Fidelidade | Diferencial verde; divergências corrigidas | ⚠️ a corrigir (Etapa B) |
| Execução/histórico | EU-01/EU-02 corrigidos com testes | ❌ |
| Interface | Playwright Chromium+Firefox + checklist manual | ❌ [NV] |
| Confiabilidade | `npm test` verde com novos testes; 20k estável | ⚠️ |
| Segurança | Escapes ok; CSP no host; sem P0/P1 | ✅ |
| Deploy | Vercel reproduzível + docs | ⚠️ |
| Documentação | README/help consistentes | ⚠️ |

Veredito: **pronto após correções específicas** (Etapas B–E).

---

## Atualização — correções aplicadas (10/10/2026)

**Etapa B concluída (todos os P1 e as divergências autorizadas):**

| Item | Correção | Evidência |
|---|---|---|
| EU-01 | Modo debug não edita mais o código (guarda no listener do editor) | `js/app.js`; testes smoke + e2e (Chromium/Firefox) |
| EU-02 | Edição invalida o trace: status/faixa avisam e o destaque de linha é suspenso | `js/app.js`; testes smoke + e2e |
| EU-03 | Igualdade frouxa entre objetos = identidade | `js/interpreter.js` (`looseEq`); teste de regressão |
| EU-04 | Alvo de atribuição resolvido uma única vez (`evalTargetRef`); `readTarget`/`writeTarget`/`assignVar` removidos | testes de regressão |
| EU-05 | `fill(v, start, end)` com negativos/NaN/limites | teste de regressão |
| EU-10 | `length`/índices criam buracos reais; `length` inválido dá erro | testes de regressão |
| EU-11 | `new` avalia argumentos antes dos inicializadores de campo | teste de regressão |
| EU-13 | `return`/`break` fora de contexto com mensagem clara (parcial: `in`/elisão seguem com erro genérico) | teste de regressão |
| EU-14 | `parseInt` detecta `0x`/`0X` sem radix | teste de regressão |
| EU-15 | Help do app corrigido (150 → 500 chamadas) | `index.html` |
| EU-18 | Servidor de dev agora escuta só em 127.0.0.1 | `servidor.js` |
| EU-21 | Slider zerado no estado vazio | `js/app.js` |
| EU-08 | Abas do editor com `role="tab"`, `aria-selected`, foco e teclado (Enter/Espaço/setas) | e2e |
| EU-09 | Buffer de código por aba com persistência (`edviz.buffers`) + migração do `edviz.code` | smoke + e2e com reload real |

**Etapa C concluída:**
- Bateria diferencial virou teste permanente (`tests/run-tests.js`): **202 núcleo + 82 UI, 0 falhas** (`npm test`).
- Diferencial contra o Node: **31/31 casos idênticos** (antes: 25/31).
- Playwright (`tests/e2e/edviz.spec.js`) em **Chromium 156 + Firefox 157**: **21 passaram, 1 skip** (`npm run test:e2e`) — cobre layout real, teclado, persistência entre reloads, `file://`, responsivo e memória.
- Memória real (Chromium headless): **12.001 passos → 139–151 ms de execução / 92,9 MB de heap**; teto de 20.000 mantido por decisão do autor, sem sinal de risco no navegador.

**Etapa E parcial:**
- `vercel.json` (CSP, nosniff, Referrer-Policy, cache de css/js), `.vercelignore`, `.gitignore` e README com seções de testes e publicação.
- Deploy em si **não executado** (aguarda ação do autor: `npx vercel --prod` ou importar o repositório na Vercel).

**Pendências não bloqueantes (P3):** EU-07 (cancelamento de animação — sem evidência de problema nos testes), EU-16 restante (código morto: `identifierAt` usado só por testes, `childNodeProp`, `countList`, `cell`, CSS `ptr-chip-*`), EU-17 (contrato de escape do `renderMessage`), EU-19 (cache de largura/constantes CSS×JS), EU-20 (metadados `forced/sticky`), EU-22 (roda do mouse no canvas — decisão de UX), mensagens genéricas para `in`/elisão de array.

**Status final: P1 e P2 acordados corrigidos; suíte completa verde; pronto para publicar na Vercel após revisão do diff e commit.**
