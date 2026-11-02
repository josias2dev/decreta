/**
 * O tema do app: claro sempre, e escuro só quando a pessoa clica. O sistema não
 * decide nada, nem na primeira visita. Vale pelo atributo na raiz enquanto o app
 * está na tela: landing, entrar e páginas abertas não dependem disso. O tema já sai
 * aplicado antes da primeira pintura por public/tema.js, que lê a mesma chave.
 */
import { useEffect, useLayoutEffect } from "react";
import { preferenciaDaPessoa } from "./preferencia";

export type Tema = "claro" | "escuro";

const BARRA: Record<Tema, string> = { claro: "#fbfaf7", escuro: "#121213" };

function aplicarTema(tema: Tema) {
  if (tema === "escuro") document.documentElement.dataset.theme = "escuro";
  else delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BARRA[tema]);
}

const preferencia = preferenciaDaPessoa<Tema>({ chave: "tema", padrao: "claro", valores: ["claro", "escuro"], aplicar: aplicarTema });

export const useTema = preferencia.useValor;

/** Enquanto o app está na tela, vale o tema da pessoa; ao sair dele, a raiz volta a ser clara. */
export function useTemaDoApp(id: string | undefined) {
  useLayoutEffect(() => {
    if (id) aplicarTema(preferencia.valorDaPessoa(id));
    return () => aplicarTema("claro");
  }, [id]);
  // A cor da barra de novo depois das telas abertas, que devolvem a delas ao fechar (useCorDaBarra).
  useEffect(() => {
    if (id) aplicarTema(preferencia.valorDaPessoa(id));
  }, [id]);
}
