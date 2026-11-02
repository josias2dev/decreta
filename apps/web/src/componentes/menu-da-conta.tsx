/**
 * O menu rápido da pessoa, no pé do menu lateral: a conta, a densidade da tela
 * ali mesmo, as configurações, a página de segurança e sair. Abre para cima, ou
 * ao lado com o menu recolhido, quando o cartão vira só a foto. No celular a
 * conta continua no botão de foto do topo.
 */
import * as Menu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronsUpDown, LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import { authCall, authClient } from "@/lib/auth";
import { DENSIDADES, useDensidade, type Densidade } from "@/lib/densidade";
import type { Eu } from "@/lib/tipos";
import { Avatar } from "./ui";

export const sessaoQuery = { queryKey: ["sessao"], queryFn: () => authCall(authClient.getSession()) };

/** Sair do Decreta: encerra a sessão, limpa o que está em memória e vai para a tela de entrar. */
export function useSair() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authCall(authClient.signOut()),
    onSettled: () => {
      qc.clear();
      void navigate({ to: "/entrar", replace: true });
    },
  });
}

export function MenuDaConta({ eu, recolhido }: { eu: Eu; recolhido: boolean }) {
  const sessao = useQuery(sessaoQuery);
  const [densidade, escolher] = useDensidade(eu.usuario.id);
  const sair = useSair();
  return (
    <Menu.Root>
      <Menu.Trigger className="dc-menu__conta" aria-label={`Menu da conta de ${eu.usuario.nome}`} title={recolhido ? eu.usuario.nome : undefined}>
        <Avatar pessoa={eu.usuario} />
        <span className="dc-menu__conta-texto">
          <strong>{eu.usuario.nome}</strong>
          <small>{eu.usuario.cargo ?? "Equipe"}</small>
        </span>
        <ChevronsUpDown aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="dc dc-menu-flutuante dc-menu-conta" side={recolhido ? "right" : "top"} align={recolhido ? "end" : "start"} sideOffset={6} collisionPadding={8}>
          <div className="dc-menu-conta__cabeca">
            <strong>{eu.usuario.nome}</strong>
            {sessao.data?.user.email && <span>{sessao.data.user.email}</span>}
          </div>
          <Menu.Separator className="dc-menu-flutuante__sep" />
          <Menu.Item asChild className="dc-menu-flutuante__item">
            <Link to="/conta">
              <UserRound aria-hidden /> Minha conta
            </Link>
          </Menu.Item>
          <Menu.Label className="dc-menu-conta__rotulo">Densidade da tela</Menu.Label>
          <Menu.RadioGroup value={densidade} onValueChange={(d) => escolher(d as Densidade)}>
            {DENSIDADES.map((d) => (
              // Troca ali mesmo: o menu fica aberto, para ver a tela mudar.
              <Menu.RadioItem key={d.id} value={d.id} className="dc-menu-flutuante__item" onSelect={(e) => e.preventDefault()}>
                {d.rotulo}
                <Menu.ItemIndicator className="dc-menu-flutuante__marca">
                  <Check aria-hidden />
                </Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
          <Menu.Separator className="dc-menu-flutuante__sep" />
          <Menu.Item asChild className="dc-menu-flutuante__item">
            <Link to="/configuracoes">
              <Settings aria-hidden /> Configurações
            </Link>
          </Menu.Item>
          <Menu.Item asChild className="dc-menu-flutuante__item">
            <Link to="/seguranca">
              <ShieldCheck aria-hidden /> Segurança e LGPD
            </Link>
          </Menu.Item>
          <Menu.Separator className="dc-menu-flutuante__sep" />
          <Menu.Item className="dc-menu-flutuante__item" onSelect={() => sair.mutate()} disabled={sair.isPending}>
            <LogOut aria-hidden /> Sair
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
