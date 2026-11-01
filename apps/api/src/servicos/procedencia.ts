/**
 * A procedência que vai junto de um resultado da IA. O commit em uso diz onde
 * ler as instruções daquela época; a impressão de cada chamada confere se são elas.
 */
import { execFileSync } from "node:child_process";
import type { Procedencia } from "@decreta/db";
import type { ChamadaDaIa } from "@decreta/ia";

function commitEmUso(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: import.meta.dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

const CODIGO = commitEmUso();

export function procedenciaDe(chamadas: ChamadaDaIa[]): Procedencia {
  return { codigo: CODIGO, chamadas };
}
