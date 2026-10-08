/* ED Viz — servidor local (sem dependências).
 *
 * Uso:
 *   node servidor.js            → http://localhost:8787
 *   node servidor.js 9000       → http://localhost:9000
 *   PORT=9000 node servidor.js  → outra porta via variável de ambiente
 *
 * Obs.: o portal também funciona com duplo clique no index.html (file://).
 * Este servidor existe para quem preferir acessar por http://localhost.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORTA = parseInt(process.argv[2] || process.env.PORT || '8787', 10);
const RAIZ = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

function responder(res, status, corpo, tipo) {
  res.writeHead(status, {
    'Content-Type': tipo || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(corpo);
}

const servidor = http.createServer(function (req, res) {
  let caminhoUrl;
  try {
    caminhoUrl = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  } catch (e) {
    responder(res, 400, 'URL inválida');
    return;
  }

  if (caminhoUrl === '/') caminhoUrl = '/index.html';

  const arquivo = path.join(RAIZ, caminhoUrl);
  const relativo = path.relative(RAIZ, arquivo);

  /* impede sair da pasta do projeto (../) */
  if (relativo.startsWith('..') || path.isAbsolute(relativo)) {
    responder(res, 403, 'Acesso negado');
    return;
  }

  fs.stat(arquivo, function (err, info) {
    if (err) {
      responder(res, 404, 'Não encontrado: ' + caminhoUrl);
      return;
    }
    let alvo = arquivo;
    if (info.isDirectory()) {
      alvo = path.join(arquivo, 'index.html');
    }
    fs.readFile(alvo, function (err2, dados) {
      if (err2) {
        responder(res, 404, 'Não encontrado: ' + caminhoUrl);
        return;
      }
      responder(res, 200, dados, MIME[path.extname(alvo).toLowerCase()] || 'application/octet-stream');
    });
  });
});

servidor.on('error', function (err) {
  if (err && err.code === 'EADDRINUSE') {
    console.error('A porta ' + PORTA + ' já está em uso. Rode com outra, por exemplo:');
    console.error('  node servidor.js ' + (PORTA + 1));
  } else {
    console.error('Erro no servidor: ' + err.message);
  }
  process.exit(1);
});

servidor.listen(PORTA, function () {
  console.log('ED Viz rodando em http://localhost:' + PORTA);
  console.log('(Ctrl+C para parar)');
});
