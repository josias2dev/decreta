/**
 * Junta o build da prévia (vite build --mode previa) num HTML só, com o CSS e
 * o JS dentro, para abrir como Artifact. Sai em dist-previa/decreta-previa.html.
 */
const PASTA = new URL("../dist-previa/", import.meta.url);
const html = await Bun.file(new URL("previa.html", PASTA)).text();
const js = /<script type="module" crossorigin src="\.?\/?([^"]+)"><\/script>/.exec(html)?.[1];
const css = /<link rel="stylesheet" crossorigin href="\.?\/?([^"]+)">/.exec(html)?.[1];
if (!js || !css) throw new Error("O build da prévia não tem o JS e o CSS esperados.");
const ler = (f: string) => Bun.file(new URL(f, PASTA)).text();

const pagina = [
  // Sem o doctype, a publicação recusa a página (não é lida como HTML).
  "<!DOCTYPE html>",
  // Sem o charset, aberta do disco a página é lida como Latin-1 e o JS quebra nos acentos.
  '<meta charset="utf-8">',
  "<title>Prévia do Decreta</title>",
  `<style>${await ler(css)}</style>`,
  '<div id="root"></div>',
  `<script type="module">${(await ler(js)).replaceAll("</script", "<\\/script")}</script>`,
  "",
].join("\n");
await Bun.write(new URL("decreta-previa.html", PASTA), pagina);
console.log(`dist-previa/decreta-previa.html (${(pagina.length / 1024).toFixed(0)} KB)`);
