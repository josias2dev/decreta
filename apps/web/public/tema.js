// O tema escuro antes da primeira pintura, para o app não piscar branco. Fica num arquivo porque a CSP
// do site não aceita script inline. Só vale no app e só se a pessoa escolheu: nada de prefers-color-scheme.
(function () {
  try {
    var aberta = /^\/($|entrar|cadastro|seguranca|termos|privacidade|cobertura|convite|enviar|redefinir-senha)/.test(location.pathname);
    if (aberta || localStorage.getItem("decreta:tema") !== "escuro") return;
    document.documentElement.setAttribute("data-theme", "escuro");
    var barra = document.querySelector('meta[name="theme-color"]');
    if (barra) barra.setAttribute("content", "#121213");
  } catch (e) {
    // Navegador sem armazenamento: fica o claro.
  }
})();
