/**
 * Uso de IA nos casos do cliente (Recomendação CFOAB 001/2024): o termo que o
 * cliente assina antes de a IA entrar no caso (itens 4.1.1 a 4.3.1) e a recusa,
 * que desliga a IA em todos os casos dele (item 4.3.2).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { useRef } from "react";
import { useAviso } from "@/componentes/avisos";
import { Botao, Painel } from "@/componentes/ui";
import { API_URL, api, mensagemDoErro } from "@/lib/api";
import { diaCompleto, diaDoInstante } from "@/lib/formato";
import type { Cliente } from "@/lib/tipos";

/** O que as telas dizem no lugar da IA, nos casos do cliente que recusou. */
export const SEM_IA = "O cliente não autorizou o uso de IA. Faça esta etapa à mão.";

export function SeloSemIa() {
  return <span className="dc-selo dc-selo--vencido">Cliente sem IA</span>;
}

export function UsoDeIa({ c }: { c: Cliente }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const entrada = useRef<HTMLInputElement>(null);
  const marcar = useMutation({
    mutationFn: (semIa: boolean) => api(`/clientes/${c.id}`, { method: "PUT", json: { semIa } }),
    onSuccess: (_, semIa) => {
      void qc.invalidateQueries({ queryKey: ["cliente", c.id] });
      void qc.invalidateQueries({ queryKey: ["processo"] });
      avisar(semIa ? "A IA fica desligada nos casos deste cliente." : "A IA volta a valer nos casos deste cliente.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const registrar = useMutation({
    mutationFn: (arquivo: File) => {
      const form = new FormData();
      form.set("arquivo", arquivo);
      form.set("clienteId", c.id);
      form.set("termoIa", "1");
      return api("/documentos", { form });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cliente", c.id] });
      void qc.invalidateQueries({ queryKey: ["documentos"] });
      avisar("Termo assinado guardado na pasta do cliente.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });

  if (c.semIa)
    return (
      <Painel titulo="Uso de IA" acao={<SeloSemIa />}>
        <div className="dc-uso-ia">
          <p>O cliente recusou o uso de IA. Nos casos dele, o Decreta não manda nada à IA: resumo, sugestão de prazo, leitura de fotos, peças, conferência da pasta e Perguntar ficam de fora, e a equipe faz essas etapas à mão.</p>
          <Botao pequeno onClick={() => marcar.mutate(false)} ocupado={marcar.isPending}>
            O cliente autorizou a IA
          </Botao>
        </div>
      </Painel>
    );

  const t = c.termoIa;
  return (
    <Painel titulo="Uso de IA">
      <div className="dc-uso-ia">
        <p>
          {t ? (
            <>
              Termo de uso de IA assinado, registrado em {diaCompleto(diaDoInstante(t.em))}:{" "}
              <a className="dc-link" href={`${API_URL}/api/app/documentos/${t.documento.id}/arquivo`}>
                {t.documento.nome}
              </a>
              .
            </>
          ) : (
            "Falta o termo de uso de IA assinado. A recomendação da OAB pede que o cliente saiba, por escrito, como a IA entra no caso e autorize antes. Baixe o termo no timbre, colha a assinatura e registre o assinado aqui."
          )}
        </p>
        <input
          ref={entrada}
          type="file"
          hidden
          accept=".pdf,.png,.jpg,.jpeg,image/*,application/pdf"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = "";
            if (arquivo) registrar.mutate(arquivo);
          }}
        />
        <div className="dc-linha-acoes">
          <a className="dc-btn dc-btn--secundaria dc-btn--sm" href={`${API_URL}/api/app/clientes/${c.id}/termo-ia`}>
            <Download /> Baixar o termo
          </a>
          <Botao pequeno onClick={() => entrada.current?.click()} ocupado={registrar.isPending}>
            <Upload /> {t ? "Registrar outro assinado" : "Registrar o assinado"}
          </Botao>
        </div>
        <p>Se o cliente recusar o uso de IA, marque abaixo: a IA fica desligada em todos os casos dele.</p>
        <Botao variante="fantasma" pequeno onClick={() => marcar.mutate(true)} ocupado={marcar.isPending}>
          O cliente recusou a IA
        </Botao>
      </div>
    </Painel>
  );
}
