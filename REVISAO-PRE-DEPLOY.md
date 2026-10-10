# Revisão pré-deploy (R2) — Resultados

- **Data:** 10/10/2026
- **Base:** commit `a490ce5` + mudanças desta revisão (ainda **não commitadas**)
- **Ambiente:** Windows · Node v24.16.0 · Chromium 156 + Firefox 157 (Playwright) · axe-core
- **Escopo:** delta pós-auditoria, caminho de deploy estático, comportamentos só visíveis em produção e triagem dos P3. **Sem re-auditar estruturas.**

## R1 — Revisão do delta + testes adversariais

- Bateria adversarial (25 casos de borda vs. Node como oráculo) na revisão inicial: **3 divergências encontradas**, todas da mesma família: índices de array/string não canônicos (`a["01"]`, `s["01"]`, `a["1e2"]`) tratados como número em vez de propriedade.
- **Correção aplicada:** regra de índice canônico do JS (`isIndexName`) + `propName` (ToPropertyKey) no acesso/atribuição/chamada/delete (`js/interpreter.js`).
- Reexecução: **25/25 casos idênticos ao Node (21 iguais + 4 erro/erro, 0 divergências)**; caso novo virou teste permanente (`tests/run-tests.js`).
- Revisão dirigida do delta (evalTargetRef, setMember/length, buffers/stale, abas): sem novos achados P1/P2.

## R2 — Dry-run do deploy estático

Pacote servido com o filtro do `.vercelignore` e os headers do `vercel.json` (Chromium + Firefox):

| Verificação | Resultado |
|---|---|
| Assets 404 | **nenhum** |
| CSP aplicada / violações | **presente / nenhuma** |
| Cache de `js/` | `public, max-age=3600, must-revalidate` |
| Arquivo excluído (`servidor.js`) | **404** (fora do deploy, correto) |
| App executa no pacote filtrado | **OK** (passo 2/10 nos dois navegadores) |

## R3 — Comportamentos de produção

- **Animações ligadas (EU-07):** stepping rápido (40 cliques) e tecla segurada (700 ms) → **sem clones presos, sem erros** (2 testes × 2 navegadores). Não reproduzido; encerrado como aceito.
- **Memória no teto:** 19.801 passos → **245 ms de execução / 124,9 MB de heap** (Chromium). Teto de 20.000 mantido com folga.
- **Acessibilidade (axe WCAG 2.0/2.1 A+AA):** 4 violações encontradas e **corrigidas**:
  1. `aria-required-attr` (crítico) — splitters focáveis sem `aria-valuenow` → atributos adicionados e valor atualizado em `applyLayout`;
  2. `color-contrast` (sério, 15–16 nós) — token `--text-muted` em 3.12:1 → ajustado para `#8b8b8b` (≥4.5:1);
  3. `nested-interactive` (sério) — botão fechar dentro do `role="tab"` → abas reestruturadas como **toolbar + botões** (setas movem foco, Enter ativa, `aria-current` na ativa);
  4. `button-name` (crítico, só Firefox) — `<button>` do `<select>` customizável sem suporte → **falso-positivo documentado e excluído no teste** (marcação inerte fora do Chromium).
  Estado final: **axe limpo (0 críticas/sérias) nos dois navegadores**.
- **Screenshots de sanidade:** `test-results/revisao-pre-deploy/` (7 estruturas + ajuda + janela estreita 720px).
- **EU-22 (roda do mouse):** mantido sem Ctrl por decisão do autor — documentado.

## R4 — Triagem final dos P3

| Item | Decisão |
|---|---|
| EU-16 código morto | **Corrigido**: removidos `identifierAt` (e seus testes), `childNodeProp`, `countList`, `cell`, CSS `ptr-chip-bg/text` (variantes SVG sem uso; o `.ptr-chip` principal segue em uso) |
| EU-17 contrato do `renderMessage` | **Documentado** no código (chamadores devem escapar) |
| EU-19 cache do hover | **Corrigido**: largura de caractere remedida no resize |
| EU-20 metadata `sticky/forced` | **Aceito/documentado** (impacto raro; correção evitaria regressão pré-deploy) |
| EU-22 roda do mouse | **Mantido** (decisão do autor) |
| `in` / elisão de array | **Corrigido**: mensagens específicas no parser + testes |

## Verificação final

| Suíte | Resultado |
|---|---|
| `npm test` (núcleo + UI simulada) | **202 + 82, 0 falhas** |
| `npx playwright test` (e2e + estresse + axe) | **31 passam, 1 skip** (memória, só Chromium) |
| Diferencial (R1) + adversarial | **31/31** e **25/25** |
| Dry-run R2 | **OK** (Chromium + Firefox) |

## Veredito

**GO para deploy.** Nenhum bloqueador; nenhuma pendência P1/P2; itens P3 com decisão registrada. As mudanças desta revisão estão **prontas para commit**.

## R5 — Publicação (pendente)

1. Commit das mudanças desta revisão (interpreter/parser/util/views/app/styles/index + specs e2e + devDependency `@axe-core/playwright`).
2. Tag sugerida: `v1.0.0`.
3. `git push origin main`.
4. Vercel: importar o repositório (framework *Other*, sem build) ou `npx vercel --prod` (requer login do autor).
5. **Pós-deploy:** abrir a URL real, rodar 1 exemplo por estrutura, conferir headers (`curl -I`) e o `localStorage`; rollback = redeploy do commit anterior.
