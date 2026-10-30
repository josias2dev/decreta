import "./index.css";
import * as Sentry from "@sentry/react";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApiError } from "./lib/api";
import { iniciarTema } from "./lib/tema";
import { router } from "./router";

// Erros das telas no navegador. O DSN entra no build (VITE_SENTRY_DSN no CI); sem ele, nada sai daqui.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) Sentry.init({ dsn: sentryDsn, environment: "producao", tracesSampleRate: 0 });

// Claro ou escuro: o que a pessoa escolheu em Minha conta, ou o do aparelho.
iniciarTema();

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err) => {
      // Sessão expirou com a tela aberta: volta para o login e depois para onde estava.
      const { pathname, href } = router.state.location;
      if (err instanceof ApiError && err.status === 401 && pathname !== "/entrar") {
        void router.navigate({ to: "/entrar", search: { redirect: href }, replace: true });
      } else if (!(err instanceof ApiError && err.status < 500)) {
        // 4xx é resposta esperada (sem permissão, não encontrado); o resto é falha de verdade.
        Sentry.captureException(err);
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      // 4xx não melhora tentando de novo.
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById("root")!, {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
}).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
