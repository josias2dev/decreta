/** Perguntar: dúvidas do dia a dia e pesquisa de jurisprudência, com a IA do escritório. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Conversa } from "@/componentes/conversa";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { Abas, Cabecalho, Carregando, Faixa, Painel, Vazio } from "@/componentes/ui";
import { aosPoucos, api } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import type { Conversa as ConversaDaApi } from "@/lib/tipos";

type Modo = "pergunte" | "jurisprudencia";

const SUGESTOES: Record<Modo, string[]> = {
  pergunte: ["Quais prazos vencem esta semana?", "Como se conta prazo em dobro para a Fazenda?", "Modelo de procuração ad judicia"],
  jurisprudencia: ["Dano moral por negativa de cobertura de plano de saúde no TJSC", "Termo inicial da correção em seguro DPVAT", "Honorários na desistência da ação antes da citação"],
};

export function PerguntarPage() {
  const celular = useCelular();
  const search = useSearch({ from: "/app/perguntar" });
  const navigate = useNavigate({ from: "/perguntar" });
  const qc = useQueryClient();
  const eu = useQuery(euQuery);
  const modo: Modo = search.modo ?? "pergunte";
  const conversa = useQuery({ queryKey: ["perguntar"], queryFn: () => api<ConversaDaApi>("/ia/perguntar") });

  const enviar = async (texto: string, aoChegar: (t: string) => void) => {
    await aosPoucos("/ia/perguntar", { json: { texto, modo } }, aoChegar);
    await qc.refetchQueries({ queryKey: ["perguntar"] });
  };
  const abas = <Abas abas={[{ id: "pergunte", rotulo: "Pergunte" }, { id: "jurisprudencia", rotulo: "Jurisprudência" }]} ativa={modo} aoMudar={(m) => void navigate({ search: m === "jurisprudencia" ? { modo: m } : {}, replace: true })} />;
  const aviso = modo === "jurisprudencia" && <Faixa tipo="aviso">A IA não consulta os tribunais ao vivo. Confira cada julgado no site do tribunal antes de citar na peça.</Faixa>;
  const corpo = !conversa.data ? (
    <Carregando linhas={3} />
  ) : !eu.data?.ia ? (
    <Vazio titulo="A IA ainda não está ligada">Quando estiver ligada, dá para tirar dúvidas do dia a dia e pesquisar jurisprudência aqui. Quem cuida do sistema do escritório liga.</Vazio>
  ) : (
    <Conversa
      mensagens={conversa.data.mensagens}
      enviar={enviar}
      rodape={conversa.data.rodape}
      placeholder={modo === "jurisprudencia" ? "Que tese você procura?" : "Pergunte o que precisar"}
      sugestoes={SUGESTOES[modo]}
      vazio={<p className="dc-nota m-0">Só você vê esta conversa. Para falar de um processo, abra o chat dentro dele: a IA responde com o que está nos autos.</p>}
      fixo={celular}
    />
  );

  if (celular) {
    return (
      <TelaCelular titulo="Perguntar" sobre="Só você vê esta conversa" voltar>
        {abas}
        {aviso}
        {corpo}
      </TelaCelular>
    );
  }
  return (
    <Pagina>
      <Cabecalho titulo="Perguntar" sub="Dúvidas do dia a dia e pesquisa de jurisprudência. Só você vê esta conversa." />
      <div className="dc-leitura flex w-full flex-col gap-4">
        {abas}
        {aviso}
        <Painel>{corpo}</Painel>
      </div>
    </Pagina>
  );
}
