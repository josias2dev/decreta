/** Auditoria da carteira no Hoje: o que se perde sem controladoria, do mais arriscado ao menos. */
import { ROTULO_DA_AUDITORIA, type AchadoDaAuditoria } from "@decreta/core";
import { useRouter } from "@tanstack/react-router";
import { Painel } from "./ui";

/** Quantos achados aparecem; o resto vira "e mais N". */
const NA_TELA = 8;

export function AuditoriaDaCarteira({ auditoria }: { auditoria: { itens: AchadoDaAuditoria[]; total: number } }) {
  const router = useRouter();
  if (!auditoria.itens.length) return null;
  const itens = auditoria.itens.slice(0, NA_TELA);
  const fora = auditoria.total - itens.length;
  return (
    <Painel titulo="Auditoria da carteira" acao={<span className="dc-nota">Varredura da madrugada</span>}>
      <ul className="dc-auditoria" aria-label="Auditoria da carteira">
        {itens.map((a) => (
          <li key={`${a.motivo}-${a.id}`}>
            <a
              href={a.caminho}
              className="dc-auditoria__item"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                router.history.push(a.caminho);
              }}
            >
              <span className="dc-auditoria__motivo" data-motivo={a.motivo}>
                {ROTULO_DA_AUDITORIA[a.motivo]}
              </span>
              <span className="dc-auditoria__titulo">{a.titulo}</span>
              <span className="dc-auditoria__detalhe">{a.detalhe}</span>
            </a>
          </li>
        ))}
      </ul>
      {fora > 0 && <p className="dc-nota m-0">E mais {fora} na carteira.</p>}
    </Painel>
  );
}
