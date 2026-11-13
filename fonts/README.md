# Geist — fontes locais

Este diretório contém os arquivos usados pelo UI Kit interno do ED Viz.

## Arquivos

| Arquivo | Família | Formato | Peso |
|---|---|---|---|
| `Geist-Variable.woff2` | Geist Sans | WOFF2 variável | 100–900 |
| `GeistMono-Variable.woff2` | Geist Mono | WOFF2 variável | 100–900 |

O UI Kit usa apenas os pesos 400, 500 e 600, definidos em `--ds-weight-*`.
Os arquivos variáveis permitem esses três pesos sem baixar uma variante por peso.

## Origem

- Projeto oficial: <https://github.com/vercel/geist-font>
- Release: `v1.9.2` (06/11/2026)
- Pacote: `geist-font-v1.9.2.zip`
- Arquivos extraídos:
  - `Geist/webfonts/Geist[wght].woff2` → `Geist-Variable.woff2`
  - `GeistMono/webfonts/GeistMono[wght].woff2` → `GeistMono-Variable.woff2`

## Licença

Geist é distribuído sob a **SIL Open Font License 1.1**.
O texto completo está em [`OFL.txt`](OFL.txt).

Copyright 2026 The Geist Project Authors:
<https://github.com/vercel/geist-font>

## Integridade

SHA-256 dos arquivos extraídos:

```text
3626EBA547294501C8A4D662C7D9EA3B49734409A4C5A1CCF12FA86429B1687E  Geist-Variable.woff2
5D93EE62680BBEC1ABC5405C2658311F9396F6F9A821EF8551EC463887E600D4  GeistMono-Variable.woff2
```

## Carregamento

As declarações `@font-face` estão em `../css/fonts.css`. O arquivo é carregado
apenas por `uikit.html` nesta etapa; as páginas de produto continuam usando a
tipografia anterior.
