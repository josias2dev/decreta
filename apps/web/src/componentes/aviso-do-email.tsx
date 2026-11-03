/**
 * Um aviso discreto para quem ainda não confirmou o e-mail: fica no Hoje e não trava nada.
 * O e-mail confirmado só é exigido para aceitar convite de outro escritório.
 */
import { useMutation } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { Faixa } from "@/componentes/ui";
import { authCall, authClient } from "@/lib/auth";
import type { Eu } from "@/lib/tipos";

export function AvisoDoEmail({ eu }: { eu: Eu | undefined }) {
  const email = eu?.usuario.email;
  const reenviar = useMutation({
    mutationFn: () => authCall(authClient.sendVerificationEmail({ email: email!, callbackURL: `${window.location.origin}/hoje` })),
  });
  if (eu?.usuario.emailConfirmado !== false || !email) return null;
  return (
    <Faixa tipo="nota">
      <Info aria-hidden />
      <span className="flex-1">
        Confirme o seu e-mail: enviamos um link para {email}. {reenviar.isSuccess ? "Enviamos o e-mail de novo. Veja também a caixa de spam." : reenviar.error ? reenviar.error.message : null}
      </span>
      {!reenviar.isSuccess && (
        <button type="button" className="dc-link flex-none" onClick={() => reenviar.mutate()} disabled={reenviar.isPending}>
          Reenviar o e-mail
        </button>
      )}
    </Faixa>
  );
}
