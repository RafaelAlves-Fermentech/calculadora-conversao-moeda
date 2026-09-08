/* =============================================================
   history.js — "Conversões recentes" (§18).
   Camada: persistência local. Não conhece a UI.

   Guarda no localStorage do navegador as últimas conversões confirmadas.
   Não há banco de dados, não há servidor, o dado não sai da máquina do
   usuário e nada aqui é informação sensível (§23).

   Uma conversão só entra no histórico quando o usuário demonstra que
   terminou de compor o valor — ao clicar em "Converter", ao sair do campo
   ou ao copiar o resultado. Registrar a cada tecla encheria a lista de
   valores intermediários ("1", "10", "100"...).
   ============================================================= */
(function (global) {
  'use strict';

  var CFG = global.APP_CONFIG;
  var KEY = 'fxcalc.v1.history';
  var mem = null;

  function hasLS() {
    try {
      localStorage.setItem(KEY + '.probe', '1');
      localStorage.removeItem(KEY + '.probe');
      return true;
    } catch (e) { return false; }
  }
  var LS = hasLS();

  function read() {
    if (mem) return mem;
    if (!LS) { mem = []; return mem; }
    try {
      var raw = localStorage.getItem(KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      mem = Array.isArray(parsed) ? parsed : [];
    } catch (e) { mem = []; }
    return mem;
  }

  function write(list) {
    mem = list;
    if (!LS) return;
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* memória basta */ }
  }

  /** Lista da mais recente para a mais antiga. */
  function list() {
    return read().slice();
  }

  /**
   * Registra uma conversão.
   * @param {{from:string, to:string, amount:number, result:number, unitRate:number}} entry
   *
   * Repetir a mesma conversão (mesmo par e mesmo valor) apenas atualiza o
   * horário da entrada existente em vez de duplicar a linha.
   */
  function add(entry) {
    if (!entry || !isFinite(entry.amount) || !isFinite(entry.result)) return list();
    var items = read().filter(function (it) {
      return !(it.from === entry.from && it.to === entry.to && it.amount === entry.amount);
    });
    items.unshift({
      at: Date.now(),
      from: entry.from,
      to: entry.to,
      amount: entry.amount,
      result: entry.result,
      unitRate: entry.unitRate
    });
    write(items.slice(0, CFG.HISTORY_LIMIT));
    return list();
  }

  function clear() {
    write([]);
    if (LS) { try { localStorage.removeItem(KEY); } catch (e) {} }
    return [];
  }

  global.History = { list: list, add: add, clear: clear, enabled: LS };
})(window);
