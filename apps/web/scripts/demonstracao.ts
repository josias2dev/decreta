/**
 * Publica a prévia em /demonstracao: copia o build da prévia (vite build --mode
 * previa) para dentro do build das telas, com a moldura da faixa fixa em volta.
 * O app fica num iframe, para a faixa não mexer em nenhuma medida das telas.
 * Sem JavaScript solto na página: a CSP daquele caminho não precisa de inline
 * (deploy/Caddyfile.decreta), e o connect-src não deixa nada sair para a rede.
 */
import { copyFileSync, cpSync, mkdirSync, rmSync } from "node:fs";

const previa = new URL("../dist-previa/", import.meta.url);
const destino = new URL("../dist/demonstracao/", import.meta.url);
mkdirSync(destino, { recursive: true });
rmSync(new URL("assets/", destino), { recursive: true, force: true });
cpSync(new URL("assets/", previa), new URL("assets/", destino), { recursive: true });
copyFileSync(new URL("previa.html", previa), new URL("app.html", destino));
copyFileSync(new URL("../src/previa/demonstracao.html", import.meta.url), new URL("index.html", destino));
console.log("dist/demonstracao pronta");
