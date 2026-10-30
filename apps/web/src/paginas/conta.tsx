/** Minha conta: perfil, senha, verificação em duas etapas, aparência e sair. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { Botao, Cabecalho, Campo, Carregando, Chip, Faixa, Painel } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { authCall, authClient } from "@/lib/auth";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import { telefone } from "@/lib/formato";
import { escolherTema, temaEscolhido, type Tema } from "@/lib/tema";
import { equipeQuery } from "./equipe";

export function ContaPage() {
  const celular = useCelular();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const eu = useQuery(euQuery);
  const sessao = useQuery({ queryKey: ["sessao"], queryFn: () => authCall(authClient.getSession()) });
  const sair = useMutation({
    mutationFn: () => authCall(authClient.signOut()),
    onSettled: () => {
      qc.clear();
      void navigate({ to: "/entrar", replace: true });
    },
  });
  const u = eu.data?.usuario;
  // A conta da demonstração é de todos: senha e verificação em duas etapas não mudam.
  const demonstracao = !!eu.data?.escritorio.demonstracao;
  const corpo = !u ? (
    <Carregando />
  ) : (
    <div className={celular ? "flex flex-col gap-6" : "dc-colunas dc-colunas--meio"}>
      <div className="dc-pilha">
        <Perfil />
        {demonstracao ? (
          <Painel titulo="Senha">
            <Faixa tipo="aviso">Esta é a conta de demonstração: todo mundo entra com ela, então a senha e a verificação em duas etapas não mudam. Toda madrugada os dados voltam ao começo.</Faixa>
          </Painel>
        ) : (
          <Senha />
        )}
      </div>
      <div className="dc-pilha">
        {!demonstracao && <DuasEtapas ligada={!!(sessao.data?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled} />}
        <Aparencia />
        <Painel titulo="Sair">
          <p className="dc-nota mb-3 mt-0">A sessão dura 30 dias neste aparelho. Saia se o aparelho não for seu.</p>
          <Botao onClick={() => sair.mutate()} ocupado={sair.isPending}>
            <LogOut /> Sair do Decreta
          </Botao>
        </Painel>
      </div>
    </div>
  );
  const sub = u ? [u.nome, u.cargo].filter(Boolean).join(" · ") : " ";
  if (celular) {
    return (
      <TelaCelular titulo="Minha conta" sobre={sub} voltar>
        {corpo}
      </TelaCelular>
    );
  }
  return (
    <Pagina>
      <Cabecalho titulo="Minha conta" sub={sub} />
      {corpo}
    </Pagina>
  );
}

function Perfil() {
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const equipe = useQuery(equipeQuery);
  const eu_ = equipe.data?.pessoas.find((p) => p.id === eu.data?.usuario.id);
  const [f, setF] = useState<{ apelido: string; cargo: string; whatsapp: string; avisoManha: boolean } | null>(null);
  const valores = f ?? (eu_ ? { apelido: eu_.apelido, cargo: eu_.cargo ?? "", whatsapp: telefone(eu_.whatsapp), avisoManha: eu_.avisoManha } : null);
  const salvar = useMutation({
    mutationFn: () => api(`/equipe/${eu_!.id}`, { method: "PUT", json: { apelido: valores!.apelido.trim() || null, cargo: valores!.cargo.trim() || null, whatsapp: valores!.whatsapp.trim() || null, avisoManha: valores!.avisoManha } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["equipe"] });
      void qc.invalidateQueries({ queryKey: ["eu"] });
      setF(null);
      avisar("Perfil salvo.");
    },
  });
  if (!valores || !eu_) return <Painel titulo="Perfil"><Carregando linhas={2} /></Painel>;
  return (
    <Painel titulo="Perfil">
      <div className="dc-form">
        <div className="dc-grade-2">
          <Campo rotulo="Como chamar" htmlFor="pf-apelido">
            <input id="pf-apelido" value={valores.apelido} onChange={(e) => setF({ ...valores, apelido: e.target.value })} />
          </Campo>
          <Campo rotulo="Cargo" htmlFor="pf-cargo">
            <input id="pf-cargo" value={valores.cargo} onChange={(e) => setF({ ...valores, cargo: e.target.value })} />
          </Campo>
        </div>
        <Campo rotulo="WhatsApp" htmlFor="pf-zap" ajuda={eu_.oab ? `${eu_.oab} · o DJEN é buscado por esta OAB` : "Peça a um sócio para cadastrar a sua OAB na Equipe"}>
          <input id="pf-zap" inputMode="tel" value={valores.whatsapp} onChange={(e) => setF({ ...valores, whatsapp: e.target.value })} placeholder="(47) 99123-4567" />
        </Campo>
        <label className="dc-opcao">
          <input type="checkbox" className="dc-checa" checked={valores.avisoManha} onChange={(e) => setF({ ...valores, avisoManha: e.target.checked })} />
          Receber de manhã, no WhatsApp, o que vence no dia
        </label>
        {salvar.error && <Faixa tipo="erro">{mensagemDoErro(salvar.error)}</Faixa>}
        <Botao className="md:self-start" variante="primaria" onClick={() => salvar.mutate()} ocupado={salvar.isPending} disabled={!f}>
          Salvar perfil
        </Botao>
      </div>
    </Painel>
  );
}

const TEMAS: [Tema, string][] = [
  ["auto", "Automático"],
  ["claro", "Claro"],
  ["escuro", "Escuro"],
];

function Aparencia() {
  const [tema, setTema] = useState<Tema>(temaEscolhido);
  return (
    <Painel titulo="Aparência">
      <p className="dc-nota mb-3 mt-0">Vale para este aparelho. No automático, segue o modo claro ou escuro do celular ou do computador.</p>
      <div className="dc-chips" role="group" aria-label="Tema">
        {TEMAS.map(([t, rotulo]) => (
          <Chip
            key={t}
            ligado={tema === t}
            onClick={() => {
              escolherTema(t);
              setTema(t);
            }}
          >
            {rotulo}
          </Chip>
        ))}
      </div>
    </Painel>
  );
}

function Senha() {
  const avisar = useAviso();
  const vazio = { atual: "", nova: "", repetir: "" };
  const [f, setF] = useState(vazio);
  const trocar = useMutation({
    mutationFn: () => authCall(authClient.changePassword({ currentPassword: f.atual, newPassword: f.nova, revokeOtherSessions: true })),
    onSuccess: () => {
      setF(vazio);
      avisar("Senha trocada. Os outros aparelhos vão pedir para entrar de novo.");
    },
  });
  const curta = f.nova.length > 0 && f.nova.length < 10;
  const diferente = f.repetir.length > 0 && f.repetir !== f.nova;
  return (
    <Painel titulo="Senha">
      <form
        className="dc-form"
        onSubmit={(e) => {
          e.preventDefault();
          trocar.mutate();
        }}
      >
        <Campo rotulo="Senha atual" htmlFor="sn-atual">
          <input id="sn-atual" type="password" autoComplete="current-password" value={f.atual} onChange={(e) => setF({ ...f, atual: e.target.value })} />
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo="Nova senha" htmlFor="sn-nova" erro={curta ? "Pelo menos 10 caracteres" : null}>
            <input id="sn-nova" type="password" autoComplete="new-password" value={f.nova} onChange={(e) => setF({ ...f, nova: e.target.value })} />
          </Campo>
          <Campo rotulo="Repita" htmlFor="sn-rep" erro={diferente ? "Não confere" : null}>
            <input id="sn-rep" type="password" autoComplete="new-password" value={f.repetir} onChange={(e) => setF({ ...f, repetir: e.target.value })} />
          </Campo>
        </div>
        {trocar.error && <Faixa tipo="erro">{trocar.error.message}</Faixa>}
        <Botao className="md:self-start" type="submit" ocupado={trocar.isPending} disabled={!f.atual || f.nova.length < 10 || f.nova !== f.repetir}>
          Trocar senha
        </Botao>
      </form>
    </Painel>
  );
}

function DuasEtapas({ ligada }: { ligada: boolean }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [etapa, setEtapa] = useState<"fechado" | "senha" | "codigo" | "desligar">("fechado");
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [qr, setQr] = useState<{ imagem: string; chave: string; uri: string; reserva: string[] } | null>(null);
  const fechar = () => {
    setEtapa("fechado");
    setSenha("");
    setCodigo("");
    setQr(null);
  };
  const ligar = useMutation({
    mutationFn: () => authCall(authClient.twoFactor.enable({ password: senha })),
    onSuccess: async (r) => {
      const uri = (r as { totpURI: string }).totpURI;
      const chave = new URL(uri).searchParams.get("secret") ?? "";
      setQr({ imagem: await QRCode.toDataURL(uri, { margin: 1, width: 200 }), chave, uri, reserva: (r as { backupCodes: string[] }).backupCodes });
      setEtapa("codigo");
    },
  });
  const confirmar = useMutation({
    mutationFn: () => authCall(authClient.twoFactor.verifyTotp({ code: codigo.replace(/\D/g, "") })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sessao"] });
      avisar("Verificação em duas etapas ligada.");
      fechar();
    },
  });
  const desligar = useMutation({
    mutationFn: () => authCall(authClient.twoFactor.disable({ password: senha })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sessao"] });
      avisar("Verificação em duas etapas desligada.");
      fechar();
    },
  });
  const erro = ligar.error ?? confirmar.error ?? desligar.error;
  return (
    <Painel titulo="Verificação em duas etapas" acao={ligada && <span className="dc-selo dc-selo--ok">Ligada</span>}>
      <p className="dc-nota mb-3 mt-0">
        {ligada ? "Ao entrar num aparelho novo, o Decreta pede o código do app autenticador." : "Recomendado: o escritório guarda dados de clientes. Além da senha, um código do app autenticador (Google Authenticator, Authy)."}
      </p>
      <Botao onClick={() => setEtapa(ligada ? "desligar" : "senha")}>
        <ShieldCheck /> {ligada ? "Desligar" : "Ligar a verificação"}
      </Botao>
      <Dialogo
        aberto={etapa !== "fechado"}
        aoFechar={fechar}
        titulo={etapa === "desligar" ? "Desligar a verificação" : "Verificação em duas etapas"}
        descricao={etapa === "codigo" ? "Leia o código com o app autenticador e digite os 6 números que aparecem." : "Confirme a sua senha para continuar."}
        acoes={
          <>
            <Botao variante="fantasma" onClick={fechar}>
              Cancelar
            </Botao>
            {etapa === "senha" && (
              <Botao variante="primaria" onClick={() => ligar.mutate()} ocupado={ligar.isPending} disabled={!senha}>
                Continuar
              </Botao>
            )}
            {etapa === "codigo" && (
              <Botao variante="primaria" onClick={() => confirmar.mutate()} ocupado={confirmar.isPending} disabled={codigo.replace(/\D/g, "").length !== 6}>
                Ligar
              </Botao>
            )}
            {etapa === "desligar" && (
              <Botao variante="perigo" onClick={() => desligar.mutate()} ocupado={desligar.isPending} disabled={!senha}>
                Desligar
              </Botao>
            )}
          </>
        }
      >
        {(etapa === "senha" || etapa === "desligar") && (
          <Campo rotulo="Senha" htmlFor="2f-senha">
            <input id="2f-senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus />
          </Campo>
        )}
        {etapa === "codigo" && qr && (
          <div className="dc-form">
            <div className="flex flex-col items-center gap-2">
              <img src={qr.imagem} alt="Código QR para o app autenticador" width={200} height={200} className="rounded-md bg-white p-1" />
              <a href={qr.uri} className="dc-link text-[13px]">
                Abrir no app autenticador deste celular
              </a>
              <span className="dc-nota text-center">
                Ou digite a chave: <span className="dc-num select-all font-medium text-[var(--tinta)]">{qr.chave.match(/.{1,4}/g)?.join(" ")}</span>
              </span>
            </div>
            <Campo rotulo="Código de 6 números" htmlFor="2f-codigo">
              <input id="2f-codigo" inputMode="numeric" autoComplete="one-time-code" value={codigo} onChange={(e) => setCodigo(e.target.value)} autoFocus />
            </Campo>
            <div className="flex flex-col gap-1">
              <span className="dc-rotulo">Códigos de recuperação (guarde num lugar seguro; cada um vale uma vez)</span>
              <pre className="dc-teor dc-num m-0 select-all text-[13px]">{qr.reserva.join("\n")}</pre>
            </div>
          </div>
        )}
        {erro && <Faixa tipo="erro">{erro.message}</Faixa>}
      </Dialogo>
    </Painel>
  );
}
