/* =============================================================
   app.js — Interface e estado da calculadora.
   Camada: apresentação. Não calcula conversão (converter.js) nem acessa a
   rede (bcb-service.js). Só orquestra e desenha.
   ============================================================= */
(function (global) {
  'use strict';

  var CFG = global.APP_CONFIG;
  var ERR = Converter.ERRORS;

  /* ---------------------------------------------------------------- estado -- */

  var state = {
    rates: null,        // { USD: {sellRate, date}, EUR: {...} }
    fetchedAt: null,    // quando falamos com o BCB pela última vez
    stale: false,       // dados vindos de cache porque a fonte falhou
    missing: [],        // moedas que a fonte não retornou
    loadError: null,    // 'network' | 'empty' | null
    loading: false,
    from: CFG.DEFAULT_FROM,
    to: CFG.DEFAULT_TO,
    amount: null,       // número já lido do campo
    result: null        // { value, unitRate } da última conversão válida
  };

  /* ------------------------------------------------------------ elementos -- */

  var el = {};
  ['amount', 'amountSymbol', 'amountHint', 'clearBtn', 'fromCurrency', 'toCurrency',
   'swapBtn', 'convertBtn', 'result', 'resultEmpty', 'resultFull', 'resultSource',
   'resultValue', 'resultRate', 'resultRateValue', 'resultRateNote', 'copyBtn',
   'copyLabel', 'ratesList', 'ratesFoot', 'historyList', 'historyEmpty',
   'clearHistoryBtn', 'notice', 'noticeTitle', 'noticeText', 'noticeRetry',
   'refreshBtn', 'refreshLabel', 'footerStamp'
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  /* ------------------------------------------------------------- mensagens -- */

  /** Mensagens de validação do campo de valor (§20). Sempre em linguagem comum. */
  var MESSAGES = {};
  MESSAGES[ERR.EMPTY] = 'Informe um valor para converter.';
  MESSAGES[ERR.NOT_A_NUMBER] = 'Informe um valor numérico válido.';
  MESSAGES[ERR.ZERO] = 'Informe um valor maior que zero.';
  MESSAGES[ERR.NEGATIVE] = 'Informe um valor positivo.';
  MESSAGES[ERR.TOO_LARGE] = 'Valor muito alto para converter.';
  MESSAGES[ERR.NO_CURRENCY] = 'Selecione as moedas de origem e destino.';
  MESSAGES[ERR.NO_RATE] = 'Cotação indisponível para esta moeda no momento.';

  /* ================================================================
     CAMPO DE VALOR (§7)
     ================================================================ */

  /**
   * Interpreta o texto do campo no padrão brasileiro.
   *
   * O ponto é SEMPRE separador de milhar e some; a vírgula é o separador
   * decimal e só a primeira vale.
   *
   *   "10.000"    -> "10000"
   *   "10.000,50" -> "10000,50"
   *   "1.234.567" -> "1234567"
   *
   * A regra é deliberadamente cega ao contexto. Uma versão anterior tentava
   * adivinhar se o ponto era decimal contando os dígitos depois dele, e isso
   * quebrava a digitação normal: ao teclar o quinto dígito de "1.234", o
   * ponto que a própria máscara tinha inserido passava a ter quatro dígitos
   * à frente, era reinterpretado como decimal, e "12345" virava "1,23".
   *
   * Quem digita ponto querendo o separador decimal continua atendido — mas
   * isso é resolvido na tecla, em reformatField(), onde dá para saber que o
   * ponto veio do usuário e não da formatação.
   */
  function normalizeTyped(text) {
    var s = String(text || '').replace(/[^\d,]/g, '');
    var parts = s.split(',');
    if (parts.length === 1) return parts[0];
    return parts[0] + ',' + parts.slice(1).join('');
  }

  /** Conta dígitos e vírgula — os caracteres que o usuário realmente digitou. */
  function significantCount(s) {
    var m = String(s).match(/[\d,]/g);
    return m ? m.length : 0;
  }

  /** Índice, no texto formatado, logo após o n-ésimo caractere significativo. */
  function positionForSignificant(text, n) {
    if (n <= 0) return 0;
    var seen = 0;
    for (var i = 0; i < text.length; i++) {
      if (/[\d,]/.test(text.charAt(i))) {
        seen++;
        if (seen === n) return i + 1;
      }
    }
    return text.length;
  }

  var lastFieldValue = '';

  /**
   * Reescreve o campo formatado, preservando a posição do cursor.
   * Chamado a cada tecla — daí o cuidado de só mexer no DOM quando muda.
   */
  function reformatField(inputType, data) {
    var field = el.amount;
    var value = field.value;
    var pos = field.selectionStart === null || field.selectionStart === undefined
      ? value.length : field.selectionStart;

    // Ponto digitado pelo usuário: no teclado numérico ele é a tecla decimal,
    // então vira vírgula. Só aqui dá para distinguir o ponto que o usuário
    // teclou do ponto que a máscara inseriu como separador de milhar. Se já
    // existe uma vírgula no campo, o ponto é apenas descartado.
    if (inputType === 'insertText' && data === '.' && pos > 0 && value.charAt(pos - 1) === '.') {
      var jaTemVirgula = value.indexOf(',') !== -1;
      value = value.slice(0, pos - 1) + (jaTemVirgula ? '' : ',') + value.slice(pos);
      if (jaTemVirgula) pos = pos - 1;
    }

    // Backspace sobre um separador de milhar: sem este ajuste o separador
    // seria recolocado pela formatação e a tecla pareceria não funcionar.
    if (inputType === 'deleteContentBackward' && lastFieldValue.charAt(pos) === '.' && pos > 0) {
      value = value.slice(0, pos - 1) + value.slice(pos);
      pos = pos - 1;
    }

    var sig = significantCount(value.slice(0, pos));
    var next = Fmt.groupDigits(normalizeTyped(value));

    if (next !== field.value) {
      field.value = next;
      var newPos = positionForSignificant(next, sig);
      try { field.setSelectionRange(newPos, newPos); } catch (e) { /* campo sem seleção */ }
    }
    lastFieldValue = field.value;
    el.clearBtn.hidden = field.value === '';
  }

  /** Ao sair do campo, completa os centavos: "10.000" -> "10.000,00". */
  function normalizeOnBlur() {
    var n = Fmt.parseAmount(el.amount.value);
    if (n === null) return;
    el.amount.value = Fmt.amount(n);
    lastFieldValue = el.amount.value;
  }

  /* ================================================================
     CONVERSÃO
     ================================================================ */

  function readAmount() {
    state.amount = Fmt.parseAmount(el.amount.value);
    return state.amount;
  }

  /** Recalcula e redesenha o resultado. Chamado a cada mudança (§15). */
  function recalculate() {
    readAmount();
    var out = Converter.convert(state.amount, state.from, state.to, state.rates);

    if (!out.ok) {
      state.result = null;
      showResultMessage(MESSAGES[out.error] || MESSAGES[ERR.EMPTY]);
      return;
    }

    state.result = out;
    showResult(out);
  }

  function showResultMessage(text) {
    el.resultEmpty.textContent = text;
    el.resultEmpty.hidden = false;
    el.resultFull.hidden = true;
    el.result.classList.remove('has-value');
  }

  function showResult(out) {
    el.resultEmpty.hidden = true;
    el.resultFull.hidden = false;
    el.result.classList.add('has-value');

    el.resultSource.textContent = Fmt.money(state.amount, state.from);
    el.resultValue.textContent = Fmt.moneySmart(out.value, state.to);

    renderRateUsed();
    pulse();
  }

  /** "Cotação utilizada: 1 USD = R$ 5,0856" (§8). */
  function renderRateUsed() {
    var desc = Converter.describeRate(state.from, state.to, state.rates);

    if (!desc) {
      // Mesma moeda na origem e no destino: não há cotação envolvida (§1).
      el.resultRateValue.textContent = 'Mesma moeda — valor mantido';
      el.resultRateNote.textContent = '';
      el.resultRateNote.hidden = true;
      return;
    }

    var quoteMeta = CFG.CURRENCIES[desc.quote];
    el.resultRateValue.textContent =
      '1 ' + desc.base + ' = ' + quoteMeta.symbol + ' ' + Fmt.rate(desc.value);

    if (desc.support) {
      // Conversão entre duas moedas estrangeiras: mostra as duas cotações do
      // Banco Central que sustentam a taxa cruzada.
      var note = desc.support.map(function (s) {
        return '1 ' + s.code + ' = ' + Fmt.rateBrl(s.value);
      }).join('  ·  ');
      el.resultRateNote.textContent = note;
      el.resultRateNote.hidden = false;
    } else {
      var date = rateDateFor(desc.base);
      el.resultRateNote.textContent = date ? 'Boletim de ' + Dates.br(date) : '';
      el.resultRateNote.hidden = !date;
    }
  }

  function rateDateFor(code) {
    return state.rates && state.rates[code] ? state.rates[code].date : null;
  }

  /** Microinteração: destaca o resultado quando ele muda (§13). */
  var pulseTimer = null;
  function pulse() {
    el.resultValue.classList.remove('is-updated');
    // Força o reinício da animação.
    void el.resultValue.offsetWidth;
    el.resultValue.classList.add('is-updated');
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(function () {
      el.resultValue.classList.remove('is-updated');
    }, 420);
  }

  /* ================================================================
     HISTÓRICO (§18)
     ================================================================ */

  /** Registra a conversão atual, se ela for válida. */
  function commitToHistory() {
    if (!state.result || state.amount === null) return;
    if (state.from === state.to) return; // nada a registrar
    History.add({
      from: state.from,
      to: state.to,
      amount: state.amount,
      result: state.result.value,
      unitRate: state.result.unitRate
    });
    renderHistory();
  }

  function renderHistory() {
    var items = History.list();
    el.historyList.innerHTML = '';
    el.historyEmpty.hidden = items.length > 0;
    el.clearHistoryBtn.hidden = items.length === 0;

    items.forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'history-item';

      var when = document.createElement('p');
      when.className = 'history-when';
      when.textContent = Dates.historyLabel(it.at);

      var pair = document.createElement('p');
      pair.className = 'history-pair';
      pair.textContent = it.from + ' → ' + it.to;

      var line = document.createElement('p');
      line.className = 'history-values';
      line.textContent = Fmt.money(it.amount, it.from) + '  →  ' +
        Fmt.moneySmart(it.result, it.to);

      li.appendChild(when);
      li.appendChild(pair);
      li.appendChild(line);

      // Clicar numa linha recompõe aquela conversão na calculadora.
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'history-reuse';
      btn.setAttribute('aria-label', 'Usar esta conversão novamente');
      li.appendChild(btn);
      btn.addEventListener('click', function () {
        el.amount.value = Fmt.amount(it.amount);
        lastFieldValue = el.amount.value;
        el.clearBtn.hidden = false;
        setCurrencies(it.from, it.to);
        recalculate();
        el.amount.focus();
      });

      el.historyList.appendChild(li);
    });
  }

  /* ================================================================
     PAINEL DE COTAÇÕES (§3, §11)
     ================================================================ */

  function renderRatesPanel() {
    el.ratesList.innerHTML = '';

    var foreign = CFG.ORDER.filter(function (c) { return !CFG.CURRENCIES[c].isBase; });

    foreign.forEach(function (code) {
      var meta = CFG.CURRENCIES[code];
      var entry = state.rates && state.rates[code];

      var card = document.createElement('article');
      card.className = 'rate-card';

      var head = document.createElement('div');
      head.className = 'rate-card-head';
      head.innerHTML =
        '<span class="rate-code">' + code + '</span>' +
        '<span class="rate-name">' + meta.shortName + '</span>';

      var value = document.createElement('p');
      value.className = 'rate-value';

      var label = document.createElement('p');
      label.className = 'rate-label';

      var when = document.createElement('p');
      when.className = 'rate-date';

      if (entry) {
        value.textContent = Fmt.rateBrl(entry.sellRate);
        label.textContent = 'Venda';
        var isToday = entry.date >= Dates.today();
        when.innerHTML = '<span class="rate-date-badge' + (isToday ? ' is-today' : '') + '">' +
          (isToday ? 'Hoje' : 'Última disponível') + '</span>' +
          '<span class="rate-date-value">' + Dates.br(entry.date) + '</span>';
      } else {
        card.classList.add('is-empty');
        value.textContent = '—';
        label.textContent = 'Cotação indisponível';
        when.textContent = '';
      }

      card.appendChild(head);
      card.appendChild(value);
      card.appendChild(label);
      card.appendChild(when);
      el.ratesList.appendChild(card);
    });

    el.ratesFoot.textContent = state.rates
      ? 'Fonte: Banco Central do Brasil'
      : '';
  }

  /* ================================================================
     AVISOS SOBRE OS DADOS (§9, §10, §20)
     ================================================================ */

  function hideNotice() {
    el.notice.hidden = true;
    el.notice.className = 'notice';
    el.noticeRetry.hidden = true;
  }

  function showNotice(kind, title, text, retry) {
    el.notice.hidden = false;
    el.notice.className = 'notice is-' + kind;
    el.noticeTitle.textContent = title;
    el.noticeText.textContent = text;
    el.noticeRetry.hidden = !retry;
  }

  /** Data do boletim mais recente entre as moedas carregadas. */
  function newestRateDate() {
    if (!state.rates) return null;
    var newest = null;
    Object.keys(state.rates).forEach(function (c) {
      var d = state.rates[c].date;
      if (d && (!newest || d > newest)) newest = d;
    });
    return newest;
  }

  function renderNotice() {
    // 1. Não há cotação nenhuma: o mais grave.
    if (!state.rates) {
      if (state.loading) { hideNotice(); return; }
      showNotice('error', 'Não foi possível obter as cotações.',
        'Não foi possível atualizar as cotações do Banco Central. ' +
        'Verifique sua conexão ou tente novamente.', true);
      return;
    }

    // 2. A fonte falhou, mas há dado guardado da última consulta.
    if (state.stale) {
      showNotice('warn', 'Exibindo a última cotação armazenada.',
        'Não foi possível falar com o Banco Central agora. Os valores abaixo são ' +
        'da consulta anterior, de ' + Dates.stamp(new Date(state.fetchedAt)) + '.', true);
      return;
    }

    // 3. Alguma moeda não veio.
    if (state.missing && state.missing.length) {
      showNotice('warn', 'Cotação incompleta.',
        'O Banco Central não retornou a cotação de ' + state.missing.join(' e ') +
        '. As demais moedas seguem disponíveis.', true);
      return;
    }

    // 4. Tudo certo, mas o boletim mais recente é de um dia anterior —
    //    fim de semana, feriado, ou antes da publicação do dia (§10).
    var newest = newestRateDate();
    if (newest && newest < Dates.today()) {
      showNotice('info', 'Última cotação disponível: ' + Dates.br(newest) + '.',
        'O Banco Central ainda não publicou boletim para hoje. ' +
        'A conversão usa a cotação de venda dessa data.', false);
      return;
    }

    hideNotice();
  }

  function renderFooter() {
    if (!state.fetchedAt) { el.footerStamp.textContent = ''; return; }
    el.footerStamp.textContent = 'Última atualização: ' + Dates.stamp(new Date(state.fetchedAt));
  }

  /* ================================================================
     SELETORES DE MOEDA
     ================================================================ */

  function fillSelects() {
    [el.fromCurrency, el.toCurrency].forEach(function (select) {
      select.innerHTML = '';
      CFG.ORDER.forEach(function (code) {
        var meta = CFG.CURRENCIES[code];
        var opt = document.createElement('option');
        opt.value = code;
        opt.textContent = code + ' — ' + meta.name;
        select.appendChild(opt);
      });
    });
    el.fromCurrency.value = state.from;
    el.toCurrency.value = state.to;
    syncSymbol();
  }

  /** O símbolo mostrado no campo acompanha a moeda de origem (§7). */
  function syncSymbol() {
    var meta = CFG.CURRENCIES[state.from];
    el.amountSymbol.textContent = meta ? meta.symbol : '';
  }

  function setCurrencies(from, to) {
    state.from = from;
    state.to = to;
    el.fromCurrency.value = from;
    el.toCurrency.value = to;
    syncSymbol();
  }

  /* ================================================================
     COPIAR RESULTADO (§19)
     ================================================================ */

  var copyTimer = null;

  function copyResult() {
    if (!state.result) return;
    var text = Fmt.plain(Fmt.moneySmart(state.result.value, state.to));

    writeClipboard(text).then(function () {
      feedbackCopy('Resultado copiado!', true);
    }).catch(function () {
      feedbackCopy('Não foi possível copiar', false);
    });
  }

  /**
   * Copia o texto, tentando a API moderna e caindo para o método antigo.
   *
   * A API de área de transferência não está disponível em todo contexto —
   * página aberta por file://, permissão negada pelo usuário, navegador
   * antigo. Quando ela recusa, o textarea temporário com execCommand ainda
   * costuma funcionar, então vale a segunda tentativa antes de avisar que
   * não deu.
   */
  function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        return legacyCopy(text);
      });
    }
    return legacyCopy(text);
  }

  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('copy'));
      } catch (e) { reject(e); }
    });
  }

  function feedbackCopy(message, ok) {
    el.copyLabel.textContent = message;
    el.copyBtn.classList.toggle('is-done', ok);
    el.copyBtn.classList.toggle('is-failed', !ok);
    clearTimeout(copyTimer);
    copyTimer = setTimeout(function () {
      el.copyLabel.textContent = 'Copiar resultado';
      el.copyBtn.classList.remove('is-done', 'is-failed');
    }, 2000);
  }

  /* ================================================================
     CARGA DAS COTAÇÕES
     ================================================================ */

  function setLoading(on) {
    state.loading = on;
    el.refreshBtn.disabled = on;
    el.refreshBtn.classList.toggle('is-busy', on);
    el.refreshLabel.textContent = on ? 'Consultando...' : 'Atualizar';
  }

  function loadRates(opts) {
    setLoading(true);
    return BcbService.getLatestRates(opts || {})
      .then(function (res) {
        state.rates = res.rates;
        state.fetchedAt = res.fetchedAt;
        state.stale = res.stale;
        state.missing = res.missing || [];
        state.loadError = null;
      })
      .catch(function (err) {
        state.rates = null;
        state.stale = false;
        state.missing = [];
        state.loadError = (err && err.kind) || 'network';
      })
      .then(function () {
        setLoading(false);
        renderRatesPanel();
        renderNotice();
        renderFooter();
        setCalculatorEnabled(!!state.rates);
        recalculate();
      });
  }

  /** Sem cotação não há conversão possível — e não se inventa uma (§9). */
  function setCalculatorEnabled(on) {
    [el.amount, el.fromCurrency, el.toCurrency, el.swapBtn, el.convertBtn]
      .forEach(function (node) { node.disabled = !on; });
    document.querySelector('.calc').classList.toggle('is-disabled', !on);
  }

  /* ================================================================
     EVENTOS
     ================================================================ */

  function bind() {
    el.amount.addEventListener('input', function (e) {
      reformatField(e.inputType, e.data);
      recalculate();
    });

    el.amount.addEventListener('blur', function () {
      normalizeOnBlur();
      recalculate();
      commitToHistory();
    });

    el.amount.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        normalizeOnBlur();
        recalculate();
        commitToHistory();
      }
    });

    el.clearBtn.addEventListener('click', function () {
      el.amount.value = '';
      lastFieldValue = '';
      el.clearBtn.hidden = true;
      recalculate();
      el.amount.focus();
    });

    el.fromCurrency.addEventListener('change', function () {
      state.from = el.fromCurrency.value;
      syncSymbol();
      recalculate();
    });

    el.toCurrency.addEventListener('change', function () {
      state.to = el.toCurrency.value;
      recalculate();
    });

    // Inversão (§6): troca as moedas e recalcula na hora.
    el.swapBtn.addEventListener('click', function () {
      setCurrencies(state.to, state.from);
      el.swapBtn.classList.remove('is-spun');
      void el.swapBtn.offsetWidth;
      el.swapBtn.classList.add('is-spun');
      recalculate();
    });

    // O botão existe como ação visual; o resultado já está sempre atualizado (§15).
    el.convertBtn.addEventListener('click', function () {
      normalizeOnBlur();
      recalculate();
      commitToHistory();
      pulse();
    });

    el.copyBtn.addEventListener('click', copyResult);

    el.clearHistoryBtn.addEventListener('click', function () {
      History.clear();
      renderHistory();
    });

    el.refreshBtn.addEventListener('click', function () {
      loadRates({ force: true });
    });

    el.noticeRetry.addEventListener('click', function () {
      loadRates({ force: true });
    });
  }

  /* ================================================================
     INÍCIO
     ================================================================ */

  function init() {
    fillSelects();
    renderHistory();
    renderRatesPanel();
    showResultMessage(MESSAGES[ERR.EMPTY]);
    bind();
    loadRates().then(function () {
      if (state.rates) el.amount.focus();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exposto para verificação manual no console durante manutenção.
  global.App = { state: state, reload: loadRates, recalculate: recalculate };
})(window);
