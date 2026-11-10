/**
 * O WhatsApp do Decreta, na conta de cada pessoa: ligar o próprio WhatsApp ao número oficial do Decreta,
 * ver como está e escolher os avisos.
 *
 * Ligar: a pessoa digita o número (o do perfil já vem escrito), o código de 6 dígitos chega no WhatsApp
 * dele e ela o digita aqui. Isso prova que o número é dela. O código vale 10 minutos, uma vez, e para
 * depois de 5 erros. A conversa começa quando ela manda a primeira mensagem, que traz as boas-vindas.
 *
 * O vínculo se renova sozinho quando a pessoa abre o Decreta; depois de 30 dias sem abrir, para.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { Botao, Campo, Carregando, Dados, Faixa, Interruptor, Painel } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { diaCompleto, diaDoInstante, telefone } from "@/lib/formato";

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
  /** O número do perfil (55 + DDD + número), que já vem escrito para ligar. */
  perfil: string | null;
  demonstracao: boolean;
}

/** Para onde o código foi (o meio do número escondido) e até quando vale. */
interface CodigoPedido {
  telefone: string;
  expiraEm: string;
}

const CHAVE = ["whatsapp"] as const;
const DIGITOS = 6;

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
            <Ligado vinculo={w.vinculo} numero={w.numero} />
          ) : (
            <Ligar perfil={w.perfil} />
          )}
          {w.servidor && w.demonstracao && <p className="dc-nota m-0">Na demonstração, o WhatsApp responde com os dados inventados deste escritório, que voltam ao começo toda madrugada.</p>}
          <Avisos avisos={w.avisos} oficial={w.servidor && !!w.vinculo} />
        </div>
      )}
    </Painel>
  );
}

/** Ainda não ligado: o número, o código que chega no WhatsApp e o código digitado aqui. */
function Ligar({ perfil }: { perfil: string | null }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [numero, setNumero] = useState(() => telefone(perfil));
  const [pedido, setPedido] = useState<CodigoPedido | null>(null);
  const [codigo, setCodigo] = useState("");
  const [agora, setAgora] = useState(() => Date.now());
  const pedir = useMutation({
    mutationFn: () => api<CodigoPedido>("/whatsapp/codigo", { method: "POST", json: { telefone: numero } }),
    onSuccess: (p) => {
      // O relógio da contagem parte de agora, e não de quando a tela abriu.
      setAgora(Date.now());
      setPedido(p);
      setCodigo("");
      confirmar.reset();
    },
  });
  const confirmar = useMutation({
    mutationFn: () => api("/whatsapp/confirmar", { method: "POST", json: { codigo } }),
    onSuccess: () => {
      avisar("WhatsApp ligado. Mande um oi para o Decreta por lá para começar.");
      void qc.invalidateQueries({ queryKey: CHAVE });
      // O número verificado vai para o perfil.
      void qc.invalidateQueries({ queryKey: ["equipe"] });
    },
  });
  useEffect(() => {
    if (!pedido) return;
    const id = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [pedido]);

  const mandar = (e: FormEvent) => {
    e.preventDefault();
    pedir.mutate();
  };
  const ligar = (e: FormEvent) => {
    e.preventDefault();
    if (codigo.length === DIGITOS) confirmar.mutate();
  };

  if (!pedido) {
    return (
      <form className="dc-form" onSubmit={mandar}>
        <p className="dc-nota m-0">
          Pelo WhatsApp chegam o resumo da manhã, o que vence no dia e as publicações para conferir, com botões para confirmar o prazo ali mesmo. Também dá para perguntar ("o que vence amanhã?") e pedir documentos ("me manda a procuração da Marina").
        </p>
        <Campo rotulo="Seu WhatsApp" htmlFor="wa-numero" ajuda="Chega um código de 6 dígitos neste número, pelo WhatsApp.">
          <input id="wa-numero" inputMode="tel" autoComplete="tel" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="(47) 99123-4567" required />
        </Campo>
        {pedir.error && <Faixa tipo="erro">{mensagemDoErro(pedir.error)}</Faixa>}
        <div>
          <Botao type="submit" variante="primaria" ocupado={pedir.isPending} disabled={!numero.trim()}>
            <MessageCircle /> Mandar código
          </Botao>
        </div>
      </form>
    );
  }

  const vencido = agora >= new Date(pedido.expiraEm).getTime();
  const falta = Math.max(0, Math.ceil((new Date(pedido.expiraEm).getTime() - agora) / 60_000));
  return (
    <form className="dc-form" onSubmit={ligar} aria-live="polite">
      <p className="dc-nota m-0">
        Mandamos um código para <span className="dc-num">{pedido.telefone}</span> pelo WhatsApp. Digite aqui os 6 dígitos.
      </p>
      <Campo rotulo="Código" htmlFor="wa-codigo">
        <input
          id="wa-codigo"
          className="dc-num"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={DIGITOS}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, DIGITOS))}
          placeholder="123456"
          autoFocus
          disabled={vencido}
        />
      </Campo>
      {vencido ? <Faixa tipo="aviso">O código passou dos 10 minutos. Peça outro.</Faixa> : confirmar.error ? <Faixa tipo="erro">{mensagemDoErro(confirmar.error)}</Faixa> : <p className="dc-nota m-0">Vale {falta === 1 ? "mais 1 minuto" : `mais ${falta} minutos`}, uma vez só.</p>}
      {pedir.error && <Faixa tipo="erro">{mensagemDoErro(pedir.error)}</Faixa>}
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" variante="primaria" ocupado={confirmar.isPending} disabled={vencido || codigo.length !== DIGITOS}>
          Ligar o WhatsApp
        </Botao>
        <Botao variante="fantasma" onClick={() => pedir.mutate()} ocupado={pedir.isPending}>
          Mandar outro código
        </Botao>
        <Botao variante="fantasma" onClick={() => setPedido(null)}>
          Trocar o número
        </Botao>
      </div>
    </form>
  );
}

/** Já ligado: o número, até quando vale, abrir a conversa e desligar. `numero`: o do Decreta, só dígitos. */
function Ligado({ vinculo, numero }: { vinculo: NonNullable<WhatsappDaPessoa["vinculo"]>; numero: string | null }) {
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
      <div className="flex flex-wrap items-center gap-3">
        {numero && (
          <a className="dc-btn dc-btn--secundaria dc-btn--md" href={`https://wa.me/${numero}?text=${encodeURIComponent("Oi")}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle /> Abrir a conversa
          </a>
        )}
        <Botao variante="fantasma" onClick={() => setConfirmar(true)}>
          Desligar o WhatsApp
        </Botao>
      </div>
      <Dialogo
        aberto={confirmar}
        aoFechar={() => setConfirmar(false)}
        titulo="Desligar o WhatsApp"
        descricao="O resumo, os avisos e as perguntas param de chegar por lá. Para ligar de novo, é só pedir outro código aqui."
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
