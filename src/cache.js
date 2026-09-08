/* =============================================================
   cache.js — Guarda a última leitura de cotações (§25).
   Camada: persistência local. Não conhece a UI nem a rede.

   Por que existe: sem cache, cada abertura da página e cada F5 bateria no
   Banco Central para buscar um número que muda uma vez por dia útil.

   Validade:
   - Última cotação já é de HOJE  -> 6 horas. O boletim de fechamento do dia
     está publicado e não muda mais; só amanhã haverá outro.
   - Última cotação é ANTERIOR a hoje -> 20 minutos. Pode ser fim de semana,
     feriado, ou um dia útil antes das ~13h (horário em que o boletim sai).
     Vale reconsultar de vez em quando para pegar o boletim assim que sair.

   Um registro vencido não é apagado: se o Banco Central estiver fora do ar,
   ele serve de contingência e a interface avisa que o dado é do cache (§9).
   ============================================================= */
(function (global) {
  'use strict';

  var KEY = 'fxcalc.v1.rates';
  var TTL_CLOSED = 6 * 60 * 60 * 1000;  // boletim do dia já publicado
  var TTL_OPEN = 20 * 60 * 1000;        // ainda pode sair boletim novo
  var mem = null;                       // espelho em memória (navegação privada)

  function hasLS() {
    try {
      localStorage.setItem(KEY + '.probe', '1');
      localStorage.removeItem(KEY + '.probe');
      return true;
    } catch (e) { return false; }
  }
  var LS = hasLS();

  /** Data mais recente presente no conjunto de cotações. */
  function latestDate(rates) {
    var newest = null;
    Object.keys(rates || {}).forEach(function (code) {
      var d = rates[code] && rates[code].date;
      if (d && (!newest || d > newest)) newest = d;
    });
    return newest;
  }

  function ttlFor(rates) {
    var d = latestDate(rates);
    return (d && d >= Dates.today()) ? TTL_CLOSED : TTL_OPEN;
  }

  /**
   * @returns {{rates:Object, fetchedAt:number, fresh:boolean}|null}
   *   `fresh:false` = existe, mas venceu. Serve de contingência (§9).
   */
  function get() {
    var entry = mem;
    if (!entry && LS) {
      try {
        var raw = localStorage.getItem(KEY);
        if (raw) { entry = JSON.parse(raw); mem = entry; }
      } catch (e) { entry = null; }
    }
    if (!entry || !entry.rates || !entry.fetchedAt) return null;
    return {
      rates: entry.rates,
      fetchedAt: entry.fetchedAt,
      fresh: (Date.now() - entry.fetchedAt) < ttlFor(entry.rates)
    };
  }

  function set(rates) {
    var entry = { rates: rates, fetchedAt: Date.now() };
    mem = entry;
    if (!LS) return;
    try { localStorage.setItem(KEY, JSON.stringify(entry)); } catch (e) { /* memória basta */ }
  }

  function clear() {
    mem = null;
    if (!LS) return;
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  global.RateCache = { get: get, set: set, clear: clear, enabled: LS };
})(window);
