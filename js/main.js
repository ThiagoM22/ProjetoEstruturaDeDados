/* Entrada única do visualizador.
 *
 * Os arquivos continuam em IIFEs que publicam `window.DSV`; importá-los nesta
 * ordem preserva o mesmo contrato que os testes do núcleo carregam diretamente
 * no Node. O `app.js` só inicializa depois que todos os módulos acima rodaram,
 * e o Vite adia módulos até o HTML estar parseado. */
import './util.js';
import './tokenizer.js';
import './parser.js';
import './interpreter.js';
import './examples.js';
import './anim.js';
import './rough.js';
import './views.js';
import './app.js';
