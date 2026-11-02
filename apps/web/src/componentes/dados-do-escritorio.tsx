/**
 * Os dados do escritório são do escritório: o sócio baixa uma cópia de tudo e
 * encerra a conta daqui, sem falar com o suporte. Fica em Configurações, na aba Dados.
 */
import { EMPRESA } from "@decreta/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { LINK_DO_CONTATO } from "@/componentes/pagina-legal";
import { Botao, Campo, Carregando, Faixa, Painel } from "@/componentes/ui";
import { API_URL, api, mensagemDoErro } from "@/lib/api";
import { diaCompleto, diaCurto, diaDoInstante, hora, tamanho } from "@/lib/formato";
import type { Exportacao } from "@/lib/tipos";

/** Quantos dias o escritório encerrado espera antes de os dados serem apagados (o mesmo da API). */
const DIAS_ATE_APAGAR = 30;
const copiasQuery = { queryKey: ["exportacoes"], queryFn: () => api<{ itens: Exportacao[] }>("/escritorio/exportacoes") } as const;

/** O que a API aceita como confirmação: o nome do escritório, sem ligar para maiúsculas nem espaços a mais. */
const comoSeEscreve = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

export function DadosDoEscritorio({ nome, demonstracao }: { nome: string; demonstracao: boolean }) {
  return (
    <div className="dc-pilha">
      <LevarTudo demonstracao={demonstracao} />
      <Encerrar nome={nome} demonstracao={demonstracao} />
    </div>
  );
}

function LevarTudo({ demonstracao }: { demonstracao: boolean }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  // Enquanto uma cópia está sendo preparada, a tela olha de novo a cada poucos segundos.
  const q = useQuery({ ...copiasQuery, refetchInterval: (consulta) => (consulta.state.data?.itens.some((i) => i.situacao === "pedida") ? 4000 : false) });
  const pedir = useMutation({
    mutationFn: () => api("/escritorio/exportacoes", { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: copiasQuery.queryKey });
      avisar("Pedido feito. Estamos preparando a cópia.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });

  // O aviso de que ficou pronta: vem quando uma cópia que estava sendo preparada muda de situação enquanto a tela está aberta.
  const preparando = useRef(new Set<string>());
  useEffect(() => {
    for (const i of q.data?.itens ?? []) {
      if (i.situacao === "pedida") preparando.current.add(i.id);
      else if (preparando.current.delete(i.id)) avisar(i.situacao === "pronta" ? "A cópia dos dados está pronta para baixar." : "A cópia dos dados não deu certo. Peça de novo.", { erro: i.situacao === "falhou" });
    }
  }, [q.data, avisar]);

  const itens = q.data?.itens ?? [];
  const preparandoAgora = itens.some((i) => i.situacao === "pedida");
  return (
    <Painel titulo="Levar os dados do escritório">
      <div className="dc-form">
        <p className="dc-nota m-0">
          Uma cópia de tudo que é do escritório: planilhas em CSV de clientes, processos, prazos, publicações, audiências, tarefas, alvarás, atendimentos, peças e o resto, mais os documentos guardados. A cópia é preparada em segundo plano, fica disponível por 7 dias e o aviso chega aqui e por e-mail.
        </p>
        {demonstracao && <Faixa tipo="aviso">Na demonstração não há dados para levar: ela é de todos.</Faixa>}
        <Botao className="md:self-start" variante="primaria" onClick={() => pedir.mutate()} ocupado={pedir.isPending} disabled={demonstracao || preparandoAgora}>
          <Download /> {preparandoAgora ? "Preparando a cópia…" : "Preparar a cópia dos dados"}
        </Botao>
        {q.isPending ? <Carregando linhas={2} /> : itens.map((i) => <Copia key={i.id} c={i} />)}
      </div>
    </Painel>
  );
}

function Copia({ c }: { c: Exportacao }) {
  const pedida = `${diaCurto(diaDoInstante(c.pedidaEm))} às ${hora(c.pedidaEm)}`;
  if (c.situacao === "pedida") {
    return (
      <div className="dc-nota m-0 flex items-start gap-2" role="status">
        <Loader className="mt-0.5 size-4 flex-none animate-spin" aria-hidden />
        <span>
          Preparando a cópia pedida em {pedida}{c.pedidaPor ? ` por ${c.pedidaPor}` : ""}. Pode sair desta tela: o aviso chega por e-mail.
        </span>
      </div>
    );
  }
  if (c.situacao === "falhou") return <Faixa tipo="erro">A cópia pedida em {pedida} não deu certo{c.erro ? ` (${c.erro})` : ""}. Peça de novo.</Faixa>;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--borda)] p-3">
      <p className="m-0 dc-t-corpo font-medium">Cópia pronta · pedida em {pedida}</p>
      <p className="dc-nota m-0">
        {c.documentos} {c.documentos === 1 ? "arquivo guardado" : "arquivos guardados"} e as planilhas
        {c.expiraEm ? `. Disponível até ${diaCompleto(diaDoInstante(c.expiraEm))}.` : "."}
        {c.partes.length > 1 ? ` São ${c.partes.length} arquivos ZIP, para o tamanho não pesar: baixe todos.` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {c.partes.map((p) => (
          <a key={p.n} className="dc-btn dc-btn--secundaria dc-btn--sm" href={`${API_URL}/api/app/escritorio/exportacoes/${c.id}/partes/${p.n}`}>
            <Download /> {c.partes.length > 1 ? `Baixar parte ${p.n} de ${c.partes.length}` : "Baixar a cópia"} · {tamanho(p.tamanho)}
          </a>
        ))}
      </div>
    </div>
  );
}

function Encerrar({ nome, demonstracao }: { nome: string; demonstracao: boolean }) {
  const [passo, setPasso] = useState<"fechado" | "explicacao" | "confirmacao">("fechado");
  const [digitado, setDigitado] = useState("");
  const [apagarEm, setApagarEm] = useState<string | null>(null);
  const qc = useQueryClient();
  const encerrar = useMutation({
    mutationFn: () => api<{ apagarEm: string }>("/escritorio/encerrar", { json: { confirmacao: digitado } }),
    onSuccess: (r) => setApagarEm(r.apagarEm),
  });
  const sair = () => {
    qc.clear();
    window.location.assign("/entrar");
  };
  const fechar = () => {
    setPasso("fechado");
    setDigitado("");
    encerrar.reset();
  };

  return (
    <Painel titulo="Encerrar o escritório">
      <div className="dc-form">
        <p className="dc-nota m-0">
          O escritório fecha na hora: ninguém mais entra, e a busca no DJEN e no DataJud e o WhatsApp param. Os dados ficam guardados por {DIAS_ATE_APAGAR} dias e depois são apagados de vez, sem como recuperar. Baixe a cópia acima antes de encerrar.
        </p>
        {demonstracao && <Faixa tipo="aviso">A demonstração é de todos e não pode ser encerrada.</Faixa>}
        <Botao className="md:self-start" variante="perigo" onClick={() => setPasso("explicacao")} disabled={demonstracao}>
          Encerrar o escritório…
        </Botao>
      </div>

      <Dialogo
        aberto={passo === "explicacao"}
        aoFechar={fechar}
        titulo="Encerrar o escritório?"
        descricao={`Leia o que acontece com ${nome}.`}
        acoes={
          <>
            <Botao variante="fantasma" onClick={fechar}>
              Cancelar
            </Botao>
            <Botao variante="perigo" onClick={() => setPasso("confirmacao")}>
              Continuar
            </Botao>
          </>
        }
      >
        <ul className="m-0 flex list-disc flex-col gap-2 pl-5 dc-t-corpo text-[var(--tinta-2)]">
          <li>Na hora, ninguém mais entra no Decreta, nem você, e as sessões abertas caem. A busca no DJEN e no DataJud e o WhatsApp do escritório param.</li>
          <li>
            Em {DIAS_ATE_APAGAR} dias os dados são apagados de vez: clientes, processos, prazos, publicações, documentos e peças. Depois disso não há como recuperar.
          </li>
          <li>Quer levar os dados? Cancele e baixe a cópia antes, no painel Levar os dados do escritório. Depois de encerrar, não dá mais para entrar para baixar.</li>
          <li>
            Mudou de ideia dentro dos {DIAS_ATE_APAGAR} dias? Fale com o Decreta pelo WhatsApp{" "}
            <a className="dc-link" href={LINK_DO_CONTATO} target="_blank" rel="noopener noreferrer">
              {EMPRESA.contato.exibicao}
            </a>
            .
          </li>
        </ul>
      </Dialogo>

      <Dialogo
        aberto={passo === "confirmacao" && !apagarEm}
        aoFechar={fechar}
        titulo="Confirme o nome do escritório"
        descricao="Para encerrar, digite o nome do escritório."
        acoes={
          <>
            <Botao variante="fantasma" onClick={fechar}>
              Cancelar
            </Botao>
            <Botao variante="perigo" onClick={() => encerrar.mutate()} ocupado={encerrar.isPending} disabled={comoSeEscreve(digitado) !== comoSeEscreve(nome)}>
              Encerrar o escritório
            </Botao>
          </>
        }
      >
        <div className="dc-form">
          <Campo rotulo={`Digite ${nome}`} htmlFor="enc-nome">
            <input id="enc-nome" autoComplete="off" value={digitado} onChange={(e) => setDigitado(e.target.value)} placeholder={nome} />
          </Campo>
          {encerrar.error && <Faixa tipo="erro">{mensagemDoErro(encerrar.error)}</Faixa>}
        </div>
      </Dialogo>

      <Dialogo
        aberto={!!apagarEm}
        aoFechar={sair}
        titulo="Escritório encerrado"
        descricao={apagarEm ? `Ninguém mais entra. Os dados serão apagados de vez em ${diaCompleto(diaDoInstante(apagarEm))}.` : undefined}
        acoes={
          <Botao variante="primaria" onClick={sair}>
            Sair do Decreta
          </Botao>
        }
      >
        <p className="dc-nota m-0">Se foi engano, fale com o Decreta até lá pelo WhatsApp {EMPRESA.contato.exibicao}.</p>
      </Dialogo>
    </Painel>
  );
}
