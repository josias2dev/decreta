/**
 * Resultados de ferramenta no formato que a IA guarda (PrazoNaIa,
 * ProcessoNaIa...), montados das amostras da demonstração, para os testes dos
 * cartões com poucos e muitos itens.
 */
import { amostras } from "./apoio";

const c = (n: string) => amostras[n]!.corpo as any;
const pessoa = (p: any) => (p ? { id: p.id, apelido: p.apelido, iniciais: p.iniciais } : null);
const processo = (p: any) => ({ id: p.id, titulo: p.titulo, cnj: p.cnj ?? null });
/** O id da amostra com o fim trocado, para repetir itens sem repetir a chave. */
const outroId = (id: string, n: number) => `${id.slice(0, -4)}${String(n).padStart(4, "0")}`;

export function prazos(n: number) {
  const base = c("prazos").itens.filter((p: any) => p.situacao !== "cumprido");
  const itens = Array.from({ length: n }, (_, i) => {
    const p = base[i % base.length];
    return {
      id: i < base.length ? p.id : outroId(p.id, i),
      tipo: p.tipo,
      fim: p.fim,
      quando: p.quando,
      urgencia: p.urgencia,
      situacao: (p.situacao === "a_confirmar" ? "a_confirmar" : "confirmado") as string,
      dias: p.dias,
      contagem: p.contagem,
      processo: processo(p.processo),
      responsavel: pessoa(p.responsavel),
      cumpridoEm: null as string | null,
    };
  });
  return { total: itens.length, itens };
}

export function processos(n: number) {
  const itens = c("processos")
    .itens.slice(0, n)
    .map((p: any, i: number) => ({
      id: p.id,
      titulo: p.titulo,
      cnj: p.cnj,
      classe: p.classe,
      assunto: null,
      orgao: p.orgao,
      comarca: p.comarca,
      situacao: p.situacao,
      fase: null,
      cliente: null,
      responsavel: pessoa(p.responsavel),
      proximoPrazo: p.proximoPrazo ? { id: outroId(p.id, i), ...p.proximoPrazo } : null,
      ultimaMovimentacao: { dia: p.ultimaMovimentacaoEm.slice(0, 10), titulo: "Juntada de petição" },
    }));
  return { total: itens.length, itens };
}

export function publicacoes(n: number) {
  const base = c("publicacoes").itens;
  const itens = Array.from({ length: n }, (_, i) => {
    const p = base[i % base.length];
    return {
      id: i < base.length ? p.id : outroId(p.id, i),
      disponibilizadaEm: p.disponibilizadaEm,
      publicadaEm: p.disponibilizadaEm,
      tipo: p.titulo.split(" · ")[0],
      orgao: "2ª Vara Cível de Joinville",
      cnj: null,
      processo: p.processoId ? { id: p.processoId, titulo: p.partes, cnj: null } : null,
      situacao: i % 3 === 1 ? "pendente" : "nova",
      resumo: null,
      teor: "Intimem-se as partes para, querendo, manifestarem-se sobre o laudo pericial juntado no evento 87, no prazo comum de 15 (quinze) dias. Após, voltem conclusos para sentença.",
    };
  });
  return { total: itens.length, itens };
}

export function clientes(n: number) {
  const itens = c("clientes")
    .itens.slice(0, n)
    .map((x: any) => ({ id: x.id, nome: x.nome, tipo: x.tipo, documento: x.documento, telefone: x.telefone, email: x.email, processos: x.processos }));
  return { total: itens.length, itens };
}

export function documentos(n: number) {
  const base = c("documentos").itens;
  const itens = Array.from({ length: n }, (_, i) => {
    const d = base[i % base.length];
    return {
      id: i < base.length ? d.id : outroId(d.id, i),
      nome: d.nome,
      mime: d.mime,
      paginas: d.paginas,
      evento: d.evento,
      em: d.em,
      processo: d.processo ? { ...d.processo, cnj: null } : null,
      cliente: d.cliente,
      trecho: "…a parte ré requer sejam prestados esclarecimentos pelo perito judicial, uma vez que não houve vistoria no imóvel nem exame presencial da autora, o que compromete a conclusão sobre a incapacidade…",
    };
  });
  return { total: itens.length, itens };
}

/** A agenda da demonstração até `ate`, como o verAgenda devolve. */
export function agenda(ate: string) {
  const dias = c("agenda")
    .dias.filter((d: any) => d.dia <= ate)
    .map((d: any) => ({
      dia: d.dia,
      rotulo: d.dia,
      itens: d.itens.map((i: any) =>
        i.tipo === "audiencia"
          ? { tipo: "audiencia", id: i.id, hora: i.hora, titulo: i.titulo, porVideo: i.porVideo, situacao: "marcada", processo: processo(i.processo) }
          : i.tipo === "prazo"
            ? { tipo: "prazo", id: i.id, titulo: i.titulo, urgencia: i.urgencia, processo: processo(i.processo) }
            : { tipo: "tarefa", id: i.id, titulo: i.titulo, concluida: !!i.concluida, processo: null },
      ),
    }));
  return { dias };
}

/** A ficha do processo da Marina, com `n` prazos em aberto. */
export function fichaDoProcesso(n: number, titulo?: string) {
  const p = c("processos").itens.find((x: any) => x.titulo.startsWith("Marina Duarte")) ?? c("processos").itens[0];
  return {
    processo: {
      ...processos(50).itens.find((x: any) => x.id === p.id),
      ...(titulo ? { titulo } : {}),
      tribunal: "TJSC",
      valorCausa: "48000.00",
      poloCliente: "ativo",
      segredo: false,
      distribuidoEm: "2026-02-10",
    },
    prazos: prazos(n).itens,
    audiencias: [],
  };
}

export const ferramenta = (id: string, nome: string, saida: unknown, entrada: Record<string, unknown> = {}) => ({ tipo: "ferramenta", id, nome, entrada, saida });
export const texto = (t: string) => ({ tipo: "texto", texto: t });
