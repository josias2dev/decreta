/** Processo salvo sem o número: o que falta e que não está sendo monitorado. */
import { describe, expect, test } from "bun:test";
import { incompletoDoProcesso } from "../src/index.ts";

const judicial = { tipo: "judicial", cnj: null, temCliente: true, orgao: "2ª Vara Cível" } as const;

describe("processo incompleto", () => {
  test("judicial sem número: incompleto e não monitorado", () => {
    expect(incompletoDoProcesso(judicial)).toEqual({ faltam: ["o número"], monitorado: false });
  });

  test("lista também o que mais falta", () => {
    expect(incompletoDoProcesso({ ...judicial, temCliente: false, orgao: null })).toEqual({ faltam: ["o número", "o cliente", "a vara"], monitorado: false });
  });

  test("com o número, não há o que marcar, mesmo sem cliente ou vara: o tribunal completa", () => {
    expect(incompletoDoProcesso({ ...judicial, cnj: "5004321-25.2026.8.24.0038", temCliente: false, orgao: null })).toBeNull();
  });

  test("caso extrajudicial não tem número mesmo", () => {
    expect(incompletoDoProcesso({ ...judicial, tipo: "extrajudicial", temCliente: false, orgao: null })).toBeNull();
  });
});
