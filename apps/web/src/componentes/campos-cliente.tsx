/**
 * Os campos do cliente que se preenchem sozinhos: o CNPJ traz a empresa da
 * Receita, o CEP traz a rua, e o CPF ou CNPJ que já é de outro cliente avisa na
 * hora. O que vem de fora entra só onde está vazio, ou onde o próprio Decreta
 * tinha posto antes; o que a pessoa digitou fica.
 */
import { cepComMascara, cnpjValido, cpfValido, enderecoEmTexto, limparCnpj } from "@decreta/core";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { api } from "@/lib/api";
import { diaCompleto } from "@/lib/formato";
import type { ConsultaDoCep, ConsultaDoCnpj, ConsultaDoCpf } from "@/lib/tipos";
import { Campo, Dados, Faixa } from "./ui";

export interface FichaDoCliente {
  nome: string;
  tipo: "pf" | "pj";
  documento: string;
  telefone: string;
  email: string;
  endereco: string;
}

export const fichaVazia = (): FichaDoCliente => ({ nome: "", tipo: "pf", documento: "", telefone: "", email: "", endereco: "" });

/**
 * Preenche sem passar por cima de quem digitou: um campo só muda se está vazio
 * ou se ainda tem o que o Decreta pôs. `soltar` deixa o valor atual ser trocado
 * (a pessoa digitou outro CEP: o endereço antigo pode ir).
 */
export function usePreencher<T extends object>(setF: Dispatch<SetStateAction<T>>) {
  const posto = useRef<Partial<Record<keyof T, string>>>({});
  const preencher = useCallback(
    (novos: Partial<Record<keyof T, string | null | undefined>>) =>
      setF((v) => {
        const r = { ...v };
        for (const [k, valor] of Object.entries(novos) as [keyof T, string | null | undefined][]) {
          if (!valor) continue;
          const atual = v[k] as unknown as string;
          if (!atual?.trim() || atual === posto.current[k]) {
            (r[k] as unknown as string) = valor;
            posto.current[k] = valor;
          }
        }
        return r;
      }),
    [setF],
  );
  const soltar = useCallback((campo: keyof T, valorAtual: string) => {
    posto.current[campo] = valorAtual;
  }, []);
  return { preencher, soltar };
}

/** O documento completo e com os dígitos certos, pronto para consultar; ou se está errado. */
export function documentoDigitado(tipo: "pf" | "pj", valor: string): { pronto: string | null; invalido: boolean } {
  const d = tipo === "pj" ? limparCnpj(valor) : valor.replace(/\D/g, "");
  const tamanho = tipo === "pj" ? 14 : 11;
  if (d.length < tamanho) return { pronto: null, invalido: false };
  const ok = d.length === tamanho && (tipo === "pj" ? cnpjValido(d) : cpfValido(d));
  return ok ? { pronto: d, invalido: false } : { pronto: null, invalido: true };
}

const comIgnorar = (ignorar?: string) => (ignorar ? `?ignorar=${ignorar}` : "");

/** A empresa pelo CNPJ: só consulta com o número completo e válido. */
export function useEmpresa(cnpj: string | null, ignorar?: string) {
  const q = useQuery({
    queryKey: ["consulta-cnpj", cnpj, ignorar ?? null],
    queryFn: () => api<ConsultaDoCnpj>(`/consultas/cnpj/${cnpj}${comIgnorar(ignorar)}`),
    enabled: !!cnpj,
    staleTime: 10 * 60_000,
    retry: false,
  });
  return { consulta: cnpj ? q.data : undefined, buscando: !!cnpj && q.isFetching && !q.data };
}

const quando = (situacao: string, desde: string | null) => (desde ? `${situacao} desde ${diaCompleto(desde)}` : situacao);

/** O que a Receita disse do CNPJ, logo abaixo do campo. */
export function DaReceita({ consulta, buscando, tipoDoCadastro = "cliente" }: { consulta?: ConsultaDoCnpj; buscando: boolean; tipoDoCadastro?: "cliente" | "parte" }) {
  if (buscando)
    return (
      <div className="dc-consulta dc-consulta--buscando" role="status">
        <LoaderCircle className="animate-spin" /> Buscando o CNPJ na Receita Federal…
      </div>
    );
  if (!consulta) return null;
  const e = consulta.empresa;
  return (
    <div className="flex flex-col gap-2">
      {consulta.cliente && tipoDoCadastro === "cliente" && <JaECliente cliente={consulta.cliente} documento="CNPJ" />}
      {consulta.fonte === "falhou" && <Faixa tipo="aviso">A Receita não respondeu agora. Dá para preencher à mão.</Faixa>}
      {consulta.fonte === "nao_achou" && <Faixa tipo="aviso">A Receita não tem este CNPJ. Confira o número; empresa aberta há poucos dias pode ainda não aparecer.</Faixa>}
      {e && (
        <div className="dc-consulta">
          <div className="dc-consulta__titulo">Da Receita Federal{consulta.exemplo ? " · exemplo inventado" : ""}</div>
          <Dados
            linhas={[
              ["Razão social", e.razaoSocial],
              ...(e.nomeFantasia ? ([["Nome fantasia", e.nomeFantasia]] as [string, string][]) : []),
              ["Situação", quando(e.situacao, e.situacaoDesde)],
              ...(e.atividade ? ([["Atividade", e.atividade]] as [string, string][]) : []),
              ...(e.enderecoEmTexto ? ([["Sede", e.enderecoEmTexto]] as [string, string][]) : []),
            ]}
          />
        </div>
      )}
      {e && !e.ativa && (
        <Faixa tipo="aviso">
          Na Receita esta empresa está {quando(e.situacao.toLocaleLowerCase("pt-BR"), e.situacaoDesde)}. Confira antes de {tipoDoCadastro === "cliente" ? "cadastrar" : "processar"}.
        </Faixa>
      )}
    </div>
  );
}

function JaECliente({ cliente, documento }: { cliente: { id: string; nome: string }; documento: string }) {
  return (
    <Faixa tipo="aviso">
      <span>
        Este {documento} já é de um cliente.{" "}
        <Link to="/clientes/$id" params={{ id: cliente.id }} className="dc-link">
          Abrir {cliente.nome}
        </Link>
      </span>
    </Faixa>
  );
}

/**
 * Documento, nome, contato e endereço. O tipo (pessoa ou empresa) fica com
 * quem usa, acima: muda a ordem, porque na empresa o CNPJ vem primeiro e
 * traz o nome.
 */
export function CamposDoCliente({ f, setF, ignorar, prefixo, focar }: { f: FichaDoCliente; setF: Dispatch<SetStateAction<FichaDoCliente>>; ignorar?: string; prefixo: string; focar?: boolean }) {
  const [cep, setCep] = useState("");
  const [numero, setNumero] = useState("");
  const { preencher, soltar } = usePreencher(setF);
  const pj = f.tipo === "pj";
  const doc = documentoDigitado(f.tipo, f.documento);
  const empresa = useEmpresa(pj ? doc.pronto : null, ignorar);
  const cpf = useQuery({
    queryKey: ["consulta-cpf", doc.pronto, ignorar ?? null],
    queryFn: () => api<ConsultaDoCpf>(`/consultas/cpf/${doc.pronto}${comIgnorar(ignorar)}`),
    enabled: !pj && !!doc.pronto,
    staleTime: 60_000,
    retry: false,
  });

  // A empresa chega uma vez por CNPJ; o CEP dela fica no campo, sem buscar de novo.
  const cepDaReceita = useRef<string | null>(null);
  const aplicada = useRef<string | null>(null);
  const e = empresa.consulta?.empresa;
  useEffect(() => {
    if (!e || aplicada.current === e.cnpj) return;
    aplicada.current = e.cnpj;
    preencher({ nome: e.razaoSocial, telefone: e.telefone, email: e.email, endereco: e.enderecoEmTexto });
    if (e.endereco?.cep && !cep) {
      cepDaReceita.current = e.endereco.cep.replace(/\D/g, "");
      setCep(e.endereco.cep);
      setNumero((n) => n || e.endereco?.numero || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e]);

  const digitosDoCep = cep.replace(/\D/g, "");
  const buscarCep = digitosDoCep.length === 8 && digitosDoCep !== cepDaReceita.current;
  const doCep = useQuery({ queryKey: ["consulta-cep", digitosDoCep], queryFn: () => api<ConsultaDoCep>(`/consultas/cep/${digitosDoCep}`), enabled: buscarCep, staleTime: Infinity, retry: false });
  const rua = buscarCep ? doCep.data?.endereco : undefined;
  useEffect(() => {
    if (rua) preencher({ endereco: enderecoEmTexto({ ...rua, numero: numero.trim() || null }) });
  }, [rua, numero, preencher]);

  const ajudaDoCep = !buscarCep
    ? undefined
    : doCep.isFetching && !doCep.data
      ? "Buscando a rua…"
      : doCep.data?.fonte === "nao_achou"
        ? "Os Correios não têm este CEP."
        : doCep.data?.fonte === "falhou"
          ? "A busca do CEP não respondeu. Digite o endereço."
          : rua
            ? `${doCep.data?.exemplo ? "Exemplo inventado · " : ""}${[rua.cidade, rua.uf].filter(Boolean).join("/")}`
            : undefined;

  const campoDoDocumento = (
    <Campo rotulo={pj ? "CNPJ" : "CPF"} htmlFor={`${prefixo}-doc`} erro={doc.invalido ? `Confira o ${pj ? "CNPJ" : "CPF"}: os dígitos não batem.` : null} ajuda={pj && !f.documento ? "O nome e o endereço vêm da Receita" : undefined}>
      <input
        id={`${prefixo}-doc`}
        className="dc-num"
        inputMode={pj ? "text" : "numeric"}
        autoCapitalize={pj ? "characters" : undefined}
        value={f.documento}
        onChange={(ev) => setF((v) => ({ ...v, documento: ev.target.value }))}
        placeholder={pj ? "00.000.000/0000-00" : "000.000.000-00"}
        autoFocus={focar && pj}
        autoComplete="off"
      />
    </Campo>
  );
  const campoDoTelefone = (
    <Campo rotulo={pj ? "Telefone" : "WhatsApp ou telefone"} htmlFor={`${prefixo}-tel`}>
      <input id={`${prefixo}-tel`} inputMode="tel" value={f.telefone} onChange={(ev) => setF((v) => ({ ...v, telefone: ev.target.value }))} placeholder="(47) 99999-0000" />
    </Campo>
  );
  const campoDoEmail = (
    <Campo rotulo="E-mail" htmlFor={`${prefixo}-email`}>
      <input id={`${prefixo}-email`} type="email" value={f.email} onChange={(ev) => setF((v) => ({ ...v, email: ev.target.value }))} />
    </Campo>
  );
  return (
    <>
      {pj && (
        <>
          {campoDoDocumento}
          <DaReceita consulta={empresa.consulta} buscando={empresa.buscando} />
        </>
      )}
      <Campo rotulo={pj ? "Razão social" : "Nome"} htmlFor={`${prefixo}-nome`}>
        <input id={`${prefixo}-nome`} autoFocus={focar && !pj} value={f.nome} onChange={(ev) => setF((v) => ({ ...v, nome: ev.target.value }))} autoComplete="off" />
      </Campo>
      {pj ? (
        <div className="dc-grade-2">
          {campoDoTelefone}
          {campoDoEmail}
        </div>
      ) : (
        <>
          <div className="dc-grade-2">
            {campoDoDocumento}
            {campoDoTelefone}
          </div>
          {cpf.data?.cliente && doc.pronto && <JaECliente cliente={cpf.data.cliente} documento="CPF" />}
          {campoDoEmail}
        </>
      )}
      <div className="dc-grade-2">
        <Campo rotulo="CEP" htmlFor={`${prefixo}-cep`} ajuda={ajudaDoCep}>
          <input
            id={`${prefixo}-cep`}
            className="dc-num"
            inputMode="numeric"
            value={cep}
            onChange={(ev) => {
              // Outro CEP: o endereço que está lá pode ser trocado pelo novo.
              soltar("endereco", f.endereco);
              setCep(ev.target.value.replace(/\D/g, "").length === 8 ? cepComMascara(ev.target.value) : ev.target.value);
            }}
            placeholder="89200-000"
            autoComplete="postal-code"
          />
        </Campo>
        <Campo rotulo="Número e complemento" htmlFor={`${prefixo}-numero`}>
          <input id={`${prefixo}-numero`} value={numero} onChange={(ev) => setNumero(ev.target.value)} placeholder="120, sala 3" />
        </Campo>
      </div>
      <Campo rotulo="Endereço" htmlFor={`${prefixo}-end`}>
        <input id={`${prefixo}-end`} value={f.endereco} onChange={(ev) => setF((v) => ({ ...v, endereco: ev.target.value }))} placeholder="Rua, número, bairro, cidade" autoComplete="street-address" />
      </Campo>
    </>
  );
}
