/**
 * Conector MCP somente leitura: a pessoa cria um token pessoal para um
 * assistente de fora (o Claude no computador, por exemplo) consultar o
 * escritório com as permissões dela. O token aparece uma vez.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Botao, Campo, Faixa, Painel } from "@/componentes/ui";
import { API_URL, api, mensagemDoErro } from "@/lib/api";
import { diaCurto, diaDoInstante } from "@/lib/formato";

type TokenMcp = { id: string; nome: string; criadoEm: string; usadoEm: string | null; expiraEm: string };

export function ConectorMcp() {
  const qc = useQueryClient();
  const avisar = useAviso();
  const tokens = useQuery({ queryKey: ["mcp", "tokens"], queryFn: () => api<{ itens: TokenMcp[] }>("/mcp/tokens") });
  const [nome, setNome] = useState("");
  const [novo, setNovo] = useState<string | null>(null);
  const criar = useMutation({
    mutationFn: () => api<{ id: string; token: string }>("/mcp/tokens", { json: { nome: nome.trim() } }),
    onSuccess: (r) => {
      setNovo(r.token);
      setNome("");
      void qc.invalidateQueries({ queryKey: ["mcp", "tokens"] });
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const revogar = useMutation({
    mutationFn: (id: string) => api(`/mcp/tokens/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["mcp", "tokens"] });
      avisar("Token revogado. O assistente perdeu o acesso.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const endereco = `${API_URL || window.location.origin}/api/mcp`;

  return (
    <Painel titulo="Conector MCP (só leitura)">
      <div className="dc-form">
        <p className="dc-nota m-0">
          Um assistente de IA de fora consulta prazos, processos e publicações do escritório com as suas permissões, sem mudar nada. Os casos de cliente que recusou a IA ficam de fora. Cada token vale 90 dias, e cada consulta fica no registro do escritório. Endereço: <span className="dc-num">{endereco}</span>
        </p>
        {novo && (
          <Faixa tipo="aviso">
            Copie agora; o token não aparece de novo: <span className="dc-num break-all" aria-label="Token novo">{novo}</span>
          </Faixa>
        )}
        {tokens.data?.itens.length ? (
          <ul className="dc-linhas" aria-label="Tokens do conector">
            {tokens.data.itens.map((t) => (
              <li key={t.id} className="dc-linhas__item">
                <span className="dc-celula min-w-0 flex-1">
                  <span className="dc-celula__1">{t.nome}</span>
                  <span className="dc-celula__2">
                    Criado em {diaCurto(diaDoInstante(t.criadoEm))} · {t.usadoEm ? `usado em ${diaCurto(diaDoInstante(t.usadoEm))}` : "ainda não usado"} · vale até {diaCurto(diaDoInstante(t.expiraEm))}
                  </span>
                </span>
                <Botao variante="fantasma" pequeno onClick={() => revogar.mutate(t.id)} ocupado={revogar.isPending && revogar.variables === t.id}>
                  Revogar
                </Botao>
              </li>
            ))}
          </ul>
        ) : null}
        <Campo rotulo="Nome do token" htmlFor="mcp-nome">
          <input id="mcp-nome" value={nome} onChange={(ev) => setNome(ev.target.value)} placeholder="Claude no computador do escritório" />
        </Campo>
        <div>
          <Botao onClick={() => criar.mutate()} ocupado={criar.isPending} disabled={nome.trim().length < 2}>
            Criar token
          </Botao>
        </div>
      </div>
    </Painel>
  );
}
