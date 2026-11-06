# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primário — estudante de Estruturas de Dados.** Aluno de faculdade cursando a disciplina, estudando sozinho (em casa ou no laboratório), escrevendo o código típico da matéria e querendo enxergar o que o próprio algoritmo faz passo a passo — para entender, revisar antes da prova ou depurar a implementação.

**Secundário — professor em aula.** Usa o portal projetado na tela para demonstrar uma operação ao vivo para a turma, conduzindo o playback e apontando o que muda no desenho.

Nenhum outro público foi confirmado.

## Product Purpose

O ED Viz existe para fazer o estudante **entender** uma estrutura de dados vendo o próprio código executar: a linha em execução fica destacada, a estrutura é redesenhada a cada passo a partir do estado real, e a faixa de explicação diz o que aconteceu. O sucesso é o aluno compreender o mecanismo e conseguir reimplementá-lo do zero sem a ferramenta — o portal não substitui a implementação.

## Positioning

O código do usuário é **interpretado de verdade** por um interpretador didático próprio (não é simulado, instrumentado nem `eval` do navegador) e o trace completo é gravado antes de qualquer desenho. Cada quadro é função pura do passo atual, então voltar, avançar, dar zoom ou redimensionar nunca corrompe o que é mostrado — o desenho não mente sobre a execução.

Isso permite o que uma instrumentação genérica não entrega: mensagens de erro em português, limites didáticos de laço/recursão, passos granulares com ponteiros e pilha de chamadas, e detecção automática das estruturas a partir de código comum de faculdade, sem anotações.

## Operating Context

- Disciplina de Estruturas de Dados: pilha, fila, listas, árvore binária e array, na ordem em que o conteúdo é ensinado; 16 exemplos prontos seguem essa ordem.
- O aluno escreve nomes comuns da matéria (`Pilha`, `Fila`, `No`, `raiz`, `inicio`, `proximo`, `#items`, `#tamanho`) e espera que a estrutura seja reconhecida sem configuração.
- Uso individual em casa/laboratório e uso coletivo em sala com projeção; por isso o playback é operável por teclado e o desenho precisa ser legível de longe.
- Desenvolvimento com Vite (`npm run dev`); o build (`dist/`) é servido por HTTP. O código do usuário fica no `localStorage`, por aba.
- Publicação estática na Vercel (demo em `edviz-rouge.vercel.app`), com build Vite, sem backend, banco ou variáveis de ambiente.

## Capabilities and Constraints

**Capacidades confirmadas**

- Visualiza pilha, fila (com e sem índices), lista simples e duplamente encadeada, árvore binária (BST e árvore simples) e array em dois modos (tamanho manual e por índice).
- Playback completo: play/pause, velocidade 0,5×–4×, passo a passo, barra de progresso, atalhos de teclado e modo debug (`F10`).
- Painéis de Comandos, Variáveis, Chamadas e Saída; dica de valor de variável no hover; pan e zoom no desenho.
- Explicação do passo em linguagem natural, derivada da comparação entre passos — não é texto roteirizado por exemplo.
- Interpretador próprio de um subconjunto didático de JavaScript, com mensagens explícitas para o que não é suportado; proteções de 20.000 passos e 500 chamadas aninhadas.

**Restrições técnicas confirmadas**

- Site estático com build Vite; JavaScript ES5 em IIFEs com `window.DSV` no runtime; zero dependências em runtime (Vite é devDependency).
- Sem backend: o código do usuário vive apenas no `localStorage`; não há conta, sincronização entre dispositivos nem compartilhamento por link.
- Tudo em português, incluindo mensagens de erro.
- Node.js é necessário para o desenvolvimento, o build e os testes; o site publicado não exige instalação.
- Testes em três camadas: núcleo, UI com DOM simulado e e2e com Playwright (Chromium + Firefox), incluindo axe.

**Direção confirmada**

- O produto deve crescer para novas estruturas além do conteúdo atual da disciplina. As ideias registradas no README — grafo, tabela hash, `Map`/`Set` — são direção, não funcionalidade implementada nem prazo.

**Decisões em aberto**

- Exportar o trace em JSON e compartilhar um link com exemplo + passo.
- Modo exercício (o portal propõe um objetivo e verifica a estrutura final).
- Padrão formal de acessibilidade (nível WCAG) não foi declarado.

## Brand Commitments

- Nome **ED Viz**, com o subtítulo **Visualizador de Estruturas de Dados**.
- Voz didática, direta e em português; o produto explica em vez de intimidar, inclusive nos erros.
- Marca gráfica existente: o símbolo de árvore binária em `favicon.svg`/`favicon.png` e o mark do cabeçalho.
- Licença MIT; o projeto é público, com demo publicado.

## Evidence on Hand

- `README.md`: descrição completa do produto, funcionalidades, subconjunto de JavaScript, exemplos, atalhos, testes e publicação.
- `docs/COMO-FOI-FEITO.md`: guia interno de arquitetura e decisões (presente no checkout local; ignorado pelo git).
- `docs/img/`: quatro capturas reais do produto (pilha, fila, lista dupla, árvore) usadas no README.
- `js/examples.js`: os 16 exemplos executáveis, conteúdo real de prática.
- `tests/`: suítes de núcleo, UI simulada e e2e que documentam o comportamento esperado.
- Demo publicado: https://edviz-rouge.vercel.app

**Ausências que o trabalho futuro não deve fabricar:** não há depoimentos de usuários, dados de uso/analytics, benchmarks de desempenho, endosso institucional nem depoimentos de professores.

## Product Principles

1. **O desenho nunca mente.** Toda animação e todo destaque derivam do estado real do passo; nada é animado "de mentirinha".
2. **Entender, não substituir.** O objetivo é a compreensão que sobrevive sem a ferramenta; o aluno continua sendo quem implementa.
3. **Zero atrito no uso.** O site publicado abre e roda imediatamente, sem conta, backend ou instalação para o aluno. O build é responsabilidade de quem mantém, não de quem estuda.
4. **Código de faculdade entra como está.** A detecção parte dos nomes e formas que o aluno já escreve; o seletor manual é rede de segurança, não requisito.
5. **Serve à sala e ao estudo solitário.** O mesmo produto precisa ser legível projetado e confortável de operar sozinho pelo teclado.

## Accessibility & Inclusion

- Playback e editor operáveis por teclado (Ctrl+Enter, Espaço, setas, Home/End, F10, Esc).
- Rótulos e papéis ARIA nos controles, abas e regiões; testes e2e com axe.
- `prefers-reduced-motion` respeitado.
- Nenhum padrão formal de acessibilidade (por exemplo, nível WCAG) foi declarado; tratar como decisão em aberto.
