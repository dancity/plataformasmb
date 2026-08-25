// Aplica o tema antes da primeira pintura — sem isto o app abre claro e
// pisca para o escuro quando o React monta.
//
// Vive em arquivo próprio, e não inline no index.html, porque a CSP do
// hosting não permite script inline. Liberar 'unsafe-inline' para salvar
// um arquivo de 300 bytes seria abrir a porta que a CSP existe para fechar;
// usar hash sha256 obrigaria a atualizar a política a cada edição daqui.
(function () {
  try {
    var t = localStorage.getItem('tema') || 'sistema';
    var escuro =
      t === 'escuro' ||
      (t === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (escuro) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    }
  } catch (e) {
    /* sem storage: segue no claro */
  }
})();
