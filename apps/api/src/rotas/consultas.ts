/**
 * Consultas para preencher os cadastros enquanto a pessoa digita: a empresa
 * pelo CNPJ, o endereço pelo CEP, se o CPF já é de um cliente e o nome que o
 * Diário mostra para uma OAB. Nada fica gravado: o formulário decide.
 */
import { cnpjValido, cpfValido, formatarDocumento, limparCnpj } from "@decreta/core";
import type { Hono } from "hono";
import { clienteComODocumento, consultarCep, consultarCnpj, consultarOab } from "../servicos/cadastros.ts";
import { pessoasDoEscritorio } from "../servicos/pessoas.ts";
import { falha, tenant, type Ambiente, type DepsDasRotas } from "./base.ts";

const UFS = new Set("AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" "));

export function rotasDasConsultas(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const fontes = { fetch: deps.captura.fetch, log: deps.log, djen: deps.captura.djen };

  app.get("/consultas/cnpj/:numero", async (c) => {
    const cnpj = limparCnpj(c.req.param("numero"));
    if (!cnpjValido(cnpj)) falha(422, "documento_invalido", "Confira o CNPJ: os dígitos não batem.");
    return tenant(c, deps, async (tx) => c.json(await consultarCnpj(fontes, tx, cnpj, { demonstracao: c.get("demonstracao"), ignorar: c.req.query("ignorar") || null })));
  });

  app.get("/consultas/cpf/:numero", async (c) => {
    const cpf = c.req.param("numero").replace(/\D/g, "");
    if (!cpfValido(cpf)) falha(422, "documento_invalido", "Confira o CPF: os dígitos não batem.");
    return tenant(c, deps, async (tx) => c.json({ cpf: formatarDocumento(cpf), cliente: await clienteComODocumento(tx, cpf, c.req.query("ignorar") || null) }));
  });

  app.get("/consultas/cep/:numero", async (c) => {
    const cep = c.req.param("numero").replace(/\D/g, "");
    if (cep.length !== 8) falha(422, "cep_invalido", "O CEP tem 8 números.");
    return c.json(await consultarCep(fontes, cep, c.get("demonstracao")));
  });

  app.get("/consultas/oab", async (c) => {
    const numero = (c.req.query("numero") ?? "").replace(/\D/g, "");
    const uf = (c.req.query("uf") ?? "").toUpperCase();
    if (!numero || numero.length > 7 || !UFS.has(uf)) falha(422, "oab_invalida", "Confira o número e a UF da OAB.");
    return tenant(c, deps, async (tx) => {
      const pessoas = c.get("demonstracao") ? await pessoasDoEscritorio(deps.db, tx, c.get("orgId")) : new Map();
      return c.json(await consultarOab(fontes, tx, { numero, uf }, { demonstracao: c.get("demonstracao"), timezone: c.get("timezone"), nomeDe: (id) => pessoas.get(id)?.nome }));
    });
  });
}
