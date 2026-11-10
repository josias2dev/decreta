/**
 * O WhatsApp do Decreta, na conta de cada pessoa: ligar o próprio WhatsApp ao número oficial do Decreta,
 * ver como está e escolher os avisos.
 *
 * Ligar: a tela pede um código (vale 10 minutos, uma vez) e mostra o QR e o link que abrem o WhatsApp
 * com a mensagem "DECRETA K7Q2-9XMP" já escrita. A pessoa manda do próprio WhatsApp; isso prova que o
 * número é dela. A tela pergunta a cada 3 segundos se já ligou.
 *
 * O vínculo se renova sozinho quando a pessoa abre o Decreta; depois de 30 dias sem abrir, para.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { Botao, Carregando, Dados, Faixa, Interruptor, Painel } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { diaCompleto, diaDoInstante } from "@/lib/formato";

interface AvisosDoWhatsapp {
  manha: boolean;
  quinzeHoras: boolean;
  prazoCurto: boolean;
}

interface WhatsappDaPessoa {
  /** O WhatsApp oficial está ligado neste servidor. */
  servidor: boolean;
  numero: string | null;
  vinculo: { ligado: true; telefone: string; verificadoEm: string; renovarAte: string; pausado: boolean; outroEscritorio: boolean } | null;
  avisos: AvisosDoWhatsapp;
  demonstracao: boolean;
}

interface Codigo {
  codigo: string;
  link: string;
  expiraEm: string;
}

const CHAVE = ["whatsapp"] as const;
const PERGUNTA_A_CADA_MS = 3000;

export function WhatsappDoDecreta() {
  const q = useQuery({ queryKey: CHAVE, queryFn: () => api<WhatsappDaPessoa>("/whatsapp") });
  const w = q.data;
  return (
    <Painel titulo="WhatsApp do Decreta">
      {q.isError ? (
        <Faixa tipo="erro">Não deu para ver o WhatsApp agora. {mensagemDoErro(q.error)}</Faixa>
      ) : !w ? (
        <Carregando linhas={3} />
      ) : (
        <div className="dc-form">
          {!w.servidor ? (
            <p className="dc-nota m-0">O WhatsApp oficial do Decreta ainda não foi ligado neste servidor. O resumo da manhã continua saindo pelo número do seu perfil.</p>
          ) : w.vinculo ? (
            <Ligado vinculo={w.vinculo} />
          ) : (
            <Ligar />
          )}
          {w.servidor && w.demonstracao && <p className="dc-nota m-0">Na demonstração, o WhatsApp responde com os dados inventados deste escritório, que voltam ao começo toda madrugada.</p>}
          <Avisos avisos={w.avisos} oficial={w.servidor && !!w.vinculo} />
        </div>
      )}
    </Painel>
  );
}

/** Ainda não ligado: o que chega pelo WhatsApp e o código para ligar. */
function Ligar() {
  const qc = useQueryClient();
  const avisar = useAviso();
  const celular = useCelular();
  const [codigo, setCodigo] = useState<(Codigo & { qr: string | null }) | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const gerar = useMutation({
    mutationFn: () => api<Codigo>("/whatsapp/codigo", { method: "POST" }),
    onSuccess: async (c) => {
      const qr = celular ? null : await QRCode.toDataURL(c.link, { margin: 1, width: 192 });
      // O relógio da contagem parte de agora, e não de quando a tela abriu.
      setAgora(Date.now());
      setCodigo({ ...c, qr });
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const vencido = !!codigo && agora >= new Date(codigo.expiraEm).getTime();
  // Enquanto o código vale, pergunta se a mensagem já chegou: ligou, a tela troca para "Ligado".
  const ligou = useQuery({
    queryKey: CHAVE,
    queryFn: () => api<WhatsappDaPessoa>("/whatsapp"),
    enabled: !!codigo && !vencido,
    refetchInterval: PERGUNTA_A_CADA_MS,
  });
  useEffect(() => {
    if (!codigo) return;
    const id = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [codigo]);
  useEffect(() => {
    if (codigo && ligou.data?.vinculo) {
      avisar("WhatsApp ligado. O resumo de amanhã já chega por lá.");
      void qc.invalidateQueries({ queryKey: CHAVE });
    }
  }, [codigo, ligou.data?.vinculo, avisar, qc]);

  if (!codigo || vencido) {
    return (
      <>
        <p className="dc-nota m-0">
          Pelo WhatsApp chegam o resumo da manhã, o que vence no dia e as publicações para conferir, com botões para confirmar o prazo ali mesmo. Também dá para perguntar ("o que vence amanhã?") e pedir documentos ("me manda a procuração da Marina").
        </p>
        {vencido && <Faixa tipo="aviso">O código passou dos 10 minutos. Gere outro.</Faixa>}
        <div>
          <Botao variante="primaria" onClick={() => gerar.mutate()} ocupado={gerar.isPending}>
            <MessageCircle /> {vencido ? "Gerar outro código" : "Ligar o meu WhatsApp"}
          </Botao>
        </div>
      </>
    );
  }

  const falta = Math.max(0, Math.ceil((new Date(codigo.expiraEm).getTime() - agora) / 60_000));
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <p className="dc-nota m-0">
        {celular ? "Toque no botão: o WhatsApp abre com a mensagem pronta. Mande como está." : "Leia o QR com a câmera do celular: o WhatsApp abre com a mensagem pronta. Mande como está."}
      </p>
      {codigo.qr && <img src={codigo.qr} alt="QR que abre o WhatsApp com o código" width={192} height={192} className="rounded-md bg-white p-2" />}
      <div className="flex flex-wrap items-center gap-3">
        <a className="dc-btn dc-btn--primaria dc-btn--md" href={codigo.link} target="_blank" rel="noopener noreferrer">
          <MessageCircle /> Abrir o WhatsApp
        </a>
        <span className="dc-num" aria-label="Código para ligar">
          {codigo.codigo}
        </span>
      </div>
      <p className="dc-nota m-0">
        Vale {falta === 1 ? "mais 1 minuto" : `mais ${falta} minutos`}, uma vez só. Esta tela muda sozinha quando a mensagem chegar.
      </p>
    </div>
  );
}

/** Já ligado: o número, até quando vale, e desligar. */
function Ligado({ vinculo }: { vinculo: NonNullable<WhatsappDaPessoa["vinculo"]> }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [confirmar, setConfirmar] = useState(false);
  const desligar = useMutation({
    mutationFn: () => api("/whatsapp", { method: "DELETE" }),
    onSuccess: () => {
      setConfirmar(false);
      void qc.invalidateQueries({ queryKey: CHAVE });
      avisar("WhatsApp desligado do Decreta.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  return (
    <>
      <Dados
        linhas={[
          ["Número", <span className="dc-num">{vinculo.telefone}</span>],
          ["Ligado em", diaCompleto(diaDoInstante(vinculo.verificadoEm))],
          ["Vale até", `${diaCompleto(diaDoInstante(vinculo.renovarAte))}, e se renova sempre que você abre o Decreta`],
        ]}
      />
      {vinculo.pausado && <Faixa tipo="nota">A equipe do Decreta está atendendo esta conversa: as respostas automáticas estão pausadas.</Faixa>}
      {vinculo.outroEscritorio && <p className="dc-nota m-0">As perguntas pelo WhatsApp são sobre outro escritório seu. Para trocar, escreva "trocar de escritório" no WhatsApp.</p>}
      <p className="dc-nota m-0">Ligue a confirmação em duas etapas do próprio WhatsApp (Configurações &gt; Conta): quem toma o seu WhatsApp leva junto o acesso ao Decreta.</p>
      <div>
        <Botao variante="fantasma" onClick={() => setConfirmar(true)}>
          Desligar o WhatsApp
        </Botao>
      </div>
      <Dialogo
        aberto={confirmar}
        aoFechar={() => setConfirmar(false)}
        titulo="Desligar o WhatsApp"
        descricao="O resumo, os avisos e as perguntas param de chegar por lá. Para ligar de novo, é só gerar outro código aqui."
        acoes={
          <>
            <Botao onClick={() => setConfirmar(false)}>Voltar</Botao>
            <Botao variante="perigo" onClick={() => desligar.mutate()} ocupado={desligar.isPending}>
              Desligar
            </Botao>
          </>
        }
      />
    </>
  );
}

/** Os avisos desta pessoa. Os das 15h e de prazo curto só existem no WhatsApp oficial. */
function Avisos({ avisos, oficial }: { avisos: AvisosDoWhatsapp; oficial: boolean }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const salvar = useMutation({
    mutationFn: (mudanca: Partial<AvisosDoWhatsapp>) => api("/whatsapp/avisos", { method: "PUT", json: mudanca }),
    onMutate: (mudanca) => qc.setQueryData<WhatsappDaPessoa>(CHAVE, (w) => (w ? { ...w, avisos: { ...w.avisos, ...mudanca } } : w)),
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: CHAVE });
      void qc.invalidateQueries({ queryKey: ["equipe"] });
    },
  });
  return (
    <div className="dc-form mt-2">
      <span className="dc-rotulo">Avisos</span>
      <Interruptor rotulo="Resumo da manhã" ajuda="Nos dias úteis: o que vence no dia, as audiências e as publicações novas." ligado={avisos.manha} aoMudar={(manha) => salvar.mutate({ manha })} />
      {oficial && (
        <>
          <Interruptor rotulo="Às 15h, o que vence hoje e está aberto" ajuda="Só chega quando existe: a rede de segurança do prazo esquecido." ligado={avisos.quinzeHoras} aoMudar={(quinzeHoras) => salvar.mutate({ quinzeHoras })} />
          <Interruptor
            rotulo="Publicação com prazo curto, na hora"
            ajuda="Quando a sugestão vence em até 2 dias úteis, sem esperar o resumo do dia seguinte."
            ligado={avisos.prazoCurto}
            aoMudar={(prazoCurto) => salvar.mutate({ prazoCurto })}
          />
        </>
      )}
    </div>
  );
}
