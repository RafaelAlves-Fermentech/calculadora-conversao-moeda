/* =============================================================
   dates.js — Utilidades de data.
   Camada: funções puras. Sem rede, sem DOM.
   ============================================================= */
(function (global) {
  'use strict';

  /** "2026-09-08" -> Date em UTC (evita deslocamento por fuso horário). */
  function toUTC(iso) {
    var p = iso.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }

  /** Date -> "YYYY-MM-DD" (sempre lido em UTC). */
  function toISO(d) {
    return d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0');
  }

  /** Hoje, no fuso local do usuário, como "YYYY-MM-DD". */
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /** "YYYY-MM-DD" -> "DD/MM/YYYY". */
  function br(iso) {
    if (!iso) return '\u2014';
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  /** "YYYY-MM-DD" -> "MM-DD-YYYY", formato exigido pela API do BCB. */
  function toBcb(iso) {
    var p = iso.split('-');
    return p[1] + '-' + p[2] + '-' + p[0];
  }

  function addDays(iso, n) {
    var d = toUTC(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return toISO(d);
  }

  /**
   * Extrai a data do campo `dataHoraCotacao` do BCB.
   * "2026-09-08 13:02:38.447299" -> "2026-09-08"
   */
  function fromBcbDateTime(value) {
    if (!value) return null;
    var iso = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
  }

  /** Momento da última consulta: "08/09/2026 às 15:47". */
  function stamp(dateObj) {
    var d = dateObj || new Date();
    return String(d.getDate()).padStart(2, '0') + '/' +
      String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear() +
      ' \u00E0s ' + String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  }

  /** Rótulo do histórico: "Hoje — 14:32", "Ontem — 09:15" ou "05/09 — 14:32". */
  function historyLabel(timestamp) {
    var d = new Date(timestamp);
    var iso = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
    var hhmm = String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
    var t = today();
    var day;
    if (iso === t) day = 'Hoje';
    else if (iso === addDays(t, -1)) day = 'Ontem';
    else day = iso.split('-')[2] + '/' + iso.split('-')[1];
    return day + ' \u2014 ' + hhmm;
  }

  global.Dates = {
    toUTC: toUTC, toISO: toISO, today: today, br: br, toBcb: toBcb,
    addDays: addDays, fromBcbDateTime: fromBcbDateTime,
    stamp: stamp, historyLabel: historyLabel
  };
})(window);
