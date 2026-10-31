/**
 * O fundo do topo da landing e da tela de entrar: um campo de letras em ASCII que ondula devagar,
 * feito de termos e artigos de lei. Nas partes fracas do campo aparecem só pontos; nas fortes, o
 * texto. Com o mouse por cima, uma lente aumenta as letras para dar para ler. Desenhado na GPU
 * (WebGL), pausa fora da tela e com a aba escondida; parado quando o sistema pede menos animação.
 * Estilos em estilos/landing.css (lp-ascii); a landing tem o canvas no HTML dela.
 */
import { useEffect, useRef } from "react";

const PALAVRAS =
  "prazo · intimação · art. 219 · dias úteis · CPC · sentença · acórdão · recurso · apelação · agravo de instrumento · embargos de declaração · réplica · contestação · petição inicial · tutela de urgência · juízo · vara cível · DJEN · OAB · mérito · trânsito em julgado · citação · audiência · perícia · laudo · honorários · custas · súmula · jurisprudência · STJ · STF · TJSC · TJPR · § 1º · art. 224 · art. 1.003 · art. 477 · contrarrazões · despacho · decisão interlocutória · cumprimento de sentença · execução · penhora · alvará · procuração · substabelecimento · prova pericial · especificação de provas · razoável duração do processo · contraditório · ampla defesa · devido processo legal · Constituição Federal · art. 5º, LXXVIII · intime-se · cumpra-se · publique-se · conclusos · vista às partes · prazo comum · 15 dias úteis · ";
const LEI =
  "Art. 219. Na contagem de prazo em dias, estabelecido por lei ou pelo juiz, computar-se-ão somente os dias úteis. Art. 224. Salvo disposição em contrário, os prazos serão contados excluindo o dia do começo e incluindo o dia do vencimento. Art. 4º As partes têm o direito de obter em prazo razoável a solução integral do mérito, incluída a atividade satisfativa. Art. 6º Todos os sujeitos do processo devem cooperar entre si para que se obtenha, em tempo razoável, decisão de mérito justa e efetiva. ";
const TEXTO = PALAVRAS + LEI;
/** Quanto a lente aumenta no centro; a borda vai até 1 bem devagar, sem anel de distorção. */
const ZOOM = 1.6;
const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace';

const VS = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";
const FS = `precision highp float;
uniform sampler2D uAtlas, uTexto;
uniform vec2 uTela, uCelula, uGrade, uAtlasGrade;
uniform float uDpr, uT, uRaio, uZoom, uFade, uEscala;
uniform vec4 uMiolo;
uniform vec3 uMouse, uTinta;
uniform float uPonto, uDois;
float bolha(vec2 p, vec2 c, float r){ vec2 d = p - c; return exp(-dot(d, d) / (r * r)); }
// Ondas largas, torcidas devagar, mais fortes nas laterais e embaixo
float campo(vec2 c, float t){
  vec2 p = c / uEscala;
  vec2 w = p + 0.22 * vec2(sin(p.y * 2.2 + t * 0.35), cos(p.x * 1.7 - t * 0.30));
  w += 0.06 * vec2(sin(w.y * 6.0 - t * 0.50), cos(w.x * 5.0 + t * 0.45));
  float faixa = pow(0.5 + 0.5 * sin((w.x * 0.8 + w.y * 1.6) * 4.2 - t * 0.55), 1.8);
  float a = uTela.x / uEscala;
  float env = bolha(p, vec2(0.12 * a + 0.05 * sin(t * 0.21), 0.35 + 0.10 * cos(t * 0.17)), 0.62)
            + bolha(p, vec2(0.88 * a + 0.05 * cos(t * 0.19), 0.30 + 0.12 * sin(t * 0.23)), 0.58)
            + 0.7 * bolha(p, vec2(0.5 * a + 0.20 * sin(t * 0.13), 0.95), 0.55);
  float f = faixa * clamp(env, 0.0, 1.0);
  // Atrás do título e dos botões só ficam pontos, para o texto ler bem; a borda é um retângulo arredondado
  vec2 m = abs(c - uMiolo.xy) / uMiolo.zw;
  float r = pow(pow(m.x, 4.0) + pow(m.y, 4.0), 0.25);
  f *= 1.0 - 0.76 * (1.0 - smoothstep(0.78, 1.05, r));
  return clamp(f, 0.0, 1.0);
}
void main(){
  vec2 px = vec2(gl_FragCoord.x, uTela.y * uDpr - gl_FragCoord.y) / uDpr;
  // A lente: perto do mouse, a tela é lida de um ponto mais próximo do centro, e as letras crescem;
  // o aumento cai devagar até a borda para não torcer o texto
  vec2 d = px - uMouse.xy;
  float u = clamp(1.0 - dot(d, d) / (uRaio * uRaio), 0.0, 1.0);
  float lente = uMouse.z * u * u;
  vec2 q = uMouse.xy + d / (1.0 + (uZoom - 1.0) * lente);
  vec2 cel = floor(q / uCelula);
  if (cel.x < 0.0 || cel.y < 0.0 || cel.x >= uGrade.x || cel.y >= uGrade.y) { gl_FragColor = vec4(0.0); return; }
  float f = max(campo((cel + 0.5) * uCelula, uT), lente * 0.5);
  if (f < 0.12) { gl_FragColor = vec4(0.0); return; }
  float idx = floor(texture2D(uTexto, (cel + 0.5) / uGrade).r * 255.0 + 0.5);
  if (f < 0.22) idx = uPonto; else if (f < 0.32) idx = uDois;
  vec2 tile = vec2(mod(idx, uAtlasGrade.x), floor(idx / uAtlasGrade.x));
  float g = texture2D(uAtlas, (tile + fract(q / uCelula)) / uAtlasGrade).a;
  float a = g * (0.07 + 0.43 * smoothstep(0.16, 1.0, f)) * mix(1.0, 1.4, lente);
  a *= smoothstep(uTela.y, uTela.y * uFade, px.y);
  gl_FragColor = vec4(uTinta * a, a);
}`;

const UNIFORMES = ["uAtlas", "uTexto", "uTela", "uCelula", "uGrade", "uAtlasGrade", "uDpr", "uT", "uRaio", "uZoom", "uFade", "uEscala", "uMiolo", "uMouse", "uTinta", "uPonto", "uDois"] as const;

type Opcoes = {
  /** O bloco de texto que o fundo deixa limpo (o título e os botões). */
  miolo?: Element | null;
};

/** Liga o fundo num canvas. Devolve a função que desliga. */
export function ligarFundoAscii(canvas: HTMLCanvasElement, opcoes: Opcoes = {}): () => void {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: true });
  if (!gl) return () => {};
  const calmo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const toque = window.matchMedia("(pointer: coarse)").matches;

  // Glifos: o espaço, os pontos das partes fracas e cada letra do texto
  const glifos = [" "];
  const indice = new Map<string, number>([[" ", 0]]);
  for (const c of "·:" + TEXTO) if (!indice.has(c)) indice.set(c, glifos.push(c) - 1);

  const prog = gl.createProgram()!;
  for (const [tipo, fonte] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]] as const) {
    const s = gl.createShader(tipo)!;
    gl.shaderSource(s, fonte);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return () => {};
    gl.attachShader(prog, s);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return () => {};
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = Object.fromEntries(UNIFORMES.map((n) => [n, gl.getUniformLocation(prog, n)])) as Record<(typeof UNIFORMES)[number], WebGLUniformLocation | null>;
  gl.uniform1i(U.uAtlas, 0);
  gl.uniform1i(U.uTexto, 1);
  gl.uniform3f(U.uTinta, 0.91, 0.91, 0.94);
  gl.uniform1f(U.uPonto, indice.get("·")!);
  gl.uniform1f(U.uDois, indice.get(":")!);
  gl.uniform1f(U.uZoom, ZOOM);
  gl.uniform1f(U.uFade, 0.62);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const texAtlas = gl.createTexture();
  const texTexto = gl.createTexture();
  const textura = (t: WebGLTexture | null, unidade: number, filtro: number) => {
    gl.activeTexture(gl.TEXTURE0 + unidade);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filtro);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtro);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };

  let W = 0;
  let H = 0;
  let cw = 8;
  let ch = 15;
  let cols = 0;
  let rows = 0;
  let dados = new Uint8Array(0);
  // Medidas no tamanho de layout, mesmo quando a página aparece ampliada ou reduzida
  const escala = () => (canvas.offsetWidth ? canvas.getBoundingClientRect().width / canvas.offsetWidth : 1);
  const relativo = (el: Element, base: DOMRect, k: number) => {
    const r = el.getBoundingClientRect();
    return r.width && r.height ? [(r.left - base.left) / k, (r.top - base.top) / k, (r.right - base.left) / k, (r.bottom - base.top) / k] : null;
  };
  // O miolo é a soma das caixas do que está dentro dele (o título, o texto, os botões)
  const caixaDoMiolo = (el: Element) => {
    const base = canvas.getBoundingClientRect();
    const k = escala();
    const filhos = [...el.children].flatMap((f) => {
      const c = relativo(f, base, k);
      return c ? [c] : [];
    });
    if (!filhos.length) return relativo(el, base, k);
    return [Math.min(...filhos.map((c) => c[0]!)), Math.min(...filhos.map((c) => c[1]!)), Math.max(...filhos.map((c) => c[2]!)), Math.max(...filhos.map((c) => c[3]!))];
  };
  const montar = () => {
    if (!canvas.offsetWidth || !canvas.offsetHeight) return false;
    const dpr = Math.min(toque ? 1.5 : 2, window.devicePixelRatio || 1);
    W = canvas.offsetWidth;
    H = canvas.offsetHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const fs = W < 760 ? 11 : 12.5;
    const medidor = document.createElement("canvas").getContext("2d")!;
    medidor.font = `500 ${fs}px ${MONO}`;
    cw = Math.round(medidor.measureText("M").width * 100) / 100;
    ch = Math.round(fs * 1.32);
    cols = Math.ceil(W / cw);
    rows = Math.ceil(H / ch);
    // Atlas dos glifos, desenhado já no tamanho da lente para as letras aumentadas saírem nítidas
    const esc = dpr * ZOOM;
    const tw = Math.ceil(cw * esc);
    const th = Math.ceil(ch * esc);
    const ac = 16;
    const ar = Math.ceil(glifos.length / ac);
    const atlas = document.createElement("canvas");
    atlas.width = tw * ac;
    atlas.height = th * ar;
    const a = atlas.getContext("2d")!;
    a.font = `500 ${fs * esc}px ${MONO}`;
    a.textAlign = "center";
    a.textBaseline = "middle";
    a.fillStyle = "#fff";
    glifos.forEach((g, i) => a.fillText(g, (i % ac) * tw + tw / 2, Math.floor(i / ac) * th + th / 2 + esc * 0.5));
    textura(texAtlas, 0, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    // O texto corre pelas linhas, cada uma começando num ponto diferente
    dados = new Uint8Array(cols * rows * 4);
    for (let y = 0; y < rows; y++) {
      const ini = (y * 37 + (y % 3) * 11) % TEXTO.length;
      for (let x = 0; x < cols; x++) {
        const k = (y * cols + x) * 4;
        dados[k] = indice.get(TEXTO.charAt((ini + x) % TEXTO.length)) ?? 0;
        dados[k + 3] = 255;
      }
    }
    textura(texTexto, 1, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, dados);
    gl.uniform2f(U.uTela, W, H);
    gl.uniform2f(U.uCelula, cw, ch);
    gl.uniform2f(U.uGrade, cols, rows);
    gl.uniform2f(U.uAtlasGrade, ac, ar);
    gl.uniform1f(U.uDpr, dpr);
    gl.uniform1f(U.uRaio, W < 760 ? 80 : 115);
    gl.uniform1f(U.uEscala, W < 760 ? 560 : 900);
    const m = opcoes.miolo && caixaDoMiolo(opcoes.miolo);
    if (m) gl.uniform4f(U.uMiolo, (m[0]! + m[2]!) / 2, (m[1]! + m[3]!) / 2, (m[2]! - m[0]!) * 0.62, (m[3]! - m[1]!) * 0.62);
    else gl.uniform4f(U.uMiolo, W / 2, H * 0.3, W * 0.3, H * 0.2);
    return true;
  };

  // Mouse: a lente entra e sai suave
  let mx = -999;
  let my = -999;
  let alvo = 0;
  let forca = 0;
  const mover = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const r = canvas.getBoundingClientRect();
    const k = escala();
    mx = (e.clientX - r.left) / k;
    my = (e.clientY - r.top) / k;
    alvo = mx >= 0 && my >= 0 && mx <= W && my <= H ? 1 : 0;
    acordar();
  };
  const sair = () => {
    alvo = 0;
    acordar();
  };
  if (!toque) {
    window.addEventListener("pointermove", mover, { passive: true });
    document.addEventListener("pointerleave", sair);
  }

  let raf = 0;
  let vivo = true;
  let visivel = true;
  let ultimo = 0;
  const t0 = performance.now();
  const quadro = (agora: number) => {
    raf = 0;
    if (!vivo) return;
    if (agora - ultimo >= (toque ? 33 : 16)) {
      ultimo = agora;
      forca += (alvo - forca) * 0.14;
      const t = calmo ? 8 : (agora - t0) / 1000;
      gl.uniform1f(U.uT, t);
      gl.uniform3f(U.uMouse, mx, my, forca);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    const lenteMexendo = Math.abs(alvo - forca) > 0.002;
    if (visivel && !document.hidden && (!calmo || lenteMexendo)) raf = requestAnimationFrame(quadro);
  };
  const acordar = () => {
    if (!raf && vivo && visivel) raf = requestAnimationFrame(quadro);
  };
  const ro = new ResizeObserver(() => {
    if (montar()) {
      ultimo = 0;
      acordar();
    }
  });
  ro.observe(canvas);
  const io = new IntersectionObserver((es) => {
    visivel = es[0]?.isIntersecting ?? true;
    acordar();
  });
  io.observe(canvas);
  document.addEventListener("visibilitychange", acordar);

  return () => {
    vivo = false;
    if (raf) cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    window.removeEventListener("pointermove", mover);
    document.removeEventListener("pointerleave", sair);
    document.removeEventListener("visibilitychange", acordar);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  };
}

/** O canvas do fundo, para telas em React (entrar). `miolo` é o seletor do bloco a deixar limpo, dentro do mesmo pai. */
export function FundoAscii({ miolo }: { miolo: string }) {
  const tela = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = tela.current;
    if (!c) return;
    return ligarFundoAscii(c, { miolo: c.parentElement?.querySelector(miolo) });
  }, [miolo]);
  return <canvas ref={tela} className="lp-ascii" aria-hidden />;
}

/** A barra do navegador no celular fica preta enquanto a tela escura está aberta. */
export function useCorDaBarra(cor: string) {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    const antes = meta.content;
    meta.content = cor;
    return () => {
      meta.content = antes;
    };
  }, [cor]);
}
