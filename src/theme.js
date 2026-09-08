/* =============================================================
   theme.js — Aparência clara e escura.
   Camada: preferência de interface. Não conhece cotação nem conversão.

   Três coisas acontecem aqui:

   1. A escolha do usuário é guardada em localStorage e vale para as próximas
      visitas.
   2. Quem nunca escolheu nada segue a preferência do sistema operacional
      (`prefers-color-scheme`) — e continua acompanhando o sistema se ele mudar
      de claro para escuro ao longo do dia.
   3. O botão do cabeçalho alterna entre as duas aparências.

   A APLICAÇÃO do tema não está aqui: ela acontece num script embutido no
   <head> do index.html, que roda antes da página desenhar. Se dependesse deste
   arquivo, a página apareceria clara por um instante antes de escurecer.
   Este módulo cuida do botão e da persistência.
   ============================================================= */
(function (global) {
  'use strict';

  var KEY = 'fxcalc.v1.theme';
  var LIGHT = 'light';
  var DARK = 'dark';

  var query = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;

  function stored() {
    try {
      var v = localStorage.getItem(KEY);
      return (v === LIGHT || v === DARK) ? v : null;
    } catch (e) { return null; }   // navegação privada, armazenamento bloqueado
  }

  function save(theme) {
    try { localStorage.setItem(KEY, theme); } catch (e) { /* vale só para esta sessão */ }
  }

  function systemTheme() {
    return (query && query.matches) ? DARK : LIGHT;
  }

  /** O tema que deve estar valendo agora. */
  function current() {
    return stored() || systemTheme();
  }

  /**
   * Aplica o tema ao documento.
   * O atributo `data-theme` no <html> é o que a folha de estilo lê; a
   * propriedade `color-scheme` faz o navegador acompanhar nos elementos que
   * ele mesmo desenha — barras de rolagem, campos nativos, menus de seleção.
   */
  function apply(theme) {
    var root = document.documentElement;

    // As transições são desligadas durante a troca. Sem isto, os elementos que
    // animam `background` a partir de uma variável — o campo de valor e o botão
    // Atualizar — ficavam presos na cor do tema anterior até a página recarregar.
    // Desligar também elimina o arrasto de cores, que numa troca de tema inteira
    // fica desagradável: o certo é a interface aparecer já no tema novo.
    root.classList.add('trocando-tema');

    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;

    // A cor da barra do navegador no celular acompanha o cabeçalho da página.
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === DARK ? '#162225' : '#FFFFFF');

    // Obriga o navegador a recalcular o estilo AGORA, ainda com as transições
    // desligadas, para que as cores novas fiquem valendo de imediato.
    //
    // Sem esta linha o navegador adiava o recálculo, encontrava as transições
    // já religadas e tentava animar a partir do valor antigo — e as
    // propriedades cujo valor vem de uma variável (`background: var(--card)`,
    // `color: var(--teal-dark)`) simplesmente congelavam no tema anterior até
    // a página ser recarregada. Ler offsetHeight é o jeito clássico de forçar
    // esse recálculo.
    void document.body.offsetHeight;

    // Religa as transições depois que o navegador desenhou o tema novo.
    var religar = function () { root.classList.remove('trocando-tema'); };
    if (global.requestAnimationFrame) {
      global.requestAnimationFrame(function () { global.requestAnimationFrame(religar); });
    }
    // Rede de segurança: em aba oculta o requestAnimationFrame não dispara.
    setTimeout(religar, 120);
  }

  function set(theme) {
    apply(theme);
    save(theme);
    render();
  }

  function toggle() {
    set(current() === DARK ? LIGHT : DARK);
  }

  /** Atualiza o botão para descrever a ação que ele executa. */
  function render() {
    var btn = document.getElementById('themeBtn');
    if (!btn) return;
    var escuro = current() === DARK;
    var acao = escuro ? 'Ativar aparência clara' : 'Ativar aparência escura';
    btn.setAttribute('aria-label', acao);
    btn.setAttribute('title', acao);
    // O botão é um interruptor: "pressionado" = aparência escura ativa.
    btn.setAttribute('aria-pressed', escuro ? 'true' : 'false');
  }

  function init() {
    apply(current());
    render();

    var btn = document.getElementById('themeBtn');
    if (btn) btn.addEventListener('click', toggle);

    // Enquanto o usuário não escolher manualmente, a página acompanha o
    // sistema — inclusive se ele trocar de tema com a página aberta.
    if (query) {
      var ouvir = function () { if (!stored()) { apply(systemTheme()); render(); } };
      if (query.addEventListener) query.addEventListener('change', ouvir);
      else if (query.addListener) query.addListener(ouvir);   // navegadores antigos
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.Theme = { current: current, set: set, toggle: toggle, LIGHT: LIGHT, DARK: DARK };
})(window);
