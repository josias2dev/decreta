/** A caixa de aceite do cadastro e do convite: sem ela marcada, a conta não é criada (a API também recusa). */
import { Link } from "@tanstack/react-router";

export function AceiteDosTermos({ marcado, aoMudar }: { marcado: boolean; aoMudar: (v: boolean) => void }) {
  return (
    <label className="lp-opcao">
      <input type="checkbox" checked={marcado} onChange={(e) => aoMudar(e.target.checked)} />
      <span>
        Li e aceito os{" "}
        <Link to="/termos" target="_blank" rel="noopener noreferrer">
          Termos de Uso
        </Link>{" "}
        e a{" "}
        <Link to="/privacidade" target="_blank" rel="noopener noreferrer">
          Política de Privacidade
        </Link>
        .
      </span>
    </label>
  );
}
