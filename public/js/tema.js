// Aplica o tema salvo antes da página desenhar (evita piscar). Script clássico, carregado no <head>.
(function () {
  try {
    var t = localStorage.getItem('espectro:tema');
    if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  } catch (e) { /* armazenamento indisponível: segue o tema do sistema */ }
})();
