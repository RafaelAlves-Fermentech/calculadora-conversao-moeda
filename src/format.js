/* =============================================================
   format.js — Formatação e leitura de números no padrão brasileiro.
   Camada: funções puras. Sem rede, sem DOM.

   Regra de precisão (§17): estas funções são usadas APENAS na apresentação.
   O arredondamento acontece aqui e em nenhum outro lugar — os cálculos em
   converter.js trabalham com o valor cheio recebido do Banco Central.
   ============================================================= */
(function (global) {
  'use strict';

  var CFG = global.APP_CONFIG;

  var nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nf4 = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: CFG.RATE_DECIMALS, maximumFractionDigits: CFG.RATE_DECIMALS
  });
  var nfGroup = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /** Troca espaços rígidos por espaço comum (importante ao copiar o texto). */
  function plain(s) { return String(s).replace(/\u00A0/g, ' '); }

  /**
   * Valor monetário com o símbolo da moeda e 2 casas.
   * money(1851.8518, 'USD') -> "US$ 1.851,85"
   */
  function money(value, code) {
    var meta = CFG.CURRENCIES[code];
    if (!isNum(value) || !meta) return '\u2014';
    return meta.symbol + ' ' + nf2.format(value);
  }

  /** Só o número, 2 casas: 1851.8518 -> "1.851,85". */
  function amount(value) {
    return isNum(value) ? nf2.format(value) : '\u2014';
  }

  var nfSmall = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 6 });

  /**
   * Como money(), mas nunca exibe "0,00" para um valor que n\u00e3o \u00e9 zero.
   *
   * Converter R$ 0,01 para d\u00f3lar d\u00e1 cerca de 0,00197 \u2014 com duas casas o
   * usu\u00e1rio leria "US$ 0,00" e concluiria que a ferramenta errou. Nesses
   * casos a exibi\u00e7\u00e3o abre at\u00e9 6 casas.
   */
  function moneySmart(value, code) {
    var meta = CFG.CURRENCIES[code];
    if (!isNum(value) || !meta) return '\u2014';
    if (value !== 0 && Math.abs(value) < 0.005) {
      return meta.symbol + ' ' + nfSmall.format(value);
    }
    return meta.symbol + ' ' + nf2.format(value);
  }

  /**
   * Cotação com 4 casas (§16): 5.0856 -> "5,0856".
   * Sem símbolo — quem chama decide o prefixo.
   */
  function rate(value) {
    return isNum(value) ? nf4.format(value) : '\u2014';
  }

  /** Cotação em reais: 5.0856 -> "R$ 5,0856". */
  function rateBrl(value) {
    return isNum(value) ? 'R$ ' + nf4.format(value) : '\u2014';
  }

  /**
   * Converte o texto digitado em número.
   * Padrão brasileiro: ponto separa milhar, vírgula separa decimal.
   * "10.000,50" -> 10000.5   |   "" -> null   |   "abc" -> null
   */
  function parseAmount(text) {
    if (text === null || text === undefined) return null;
    var s = String(text).trim();
    if (!s) return null;
    s = s.replace(/\s|\u00A0/g, '').replace(/\./g, '').replace(',', '.');
    if (!/^-?\d*\.?\d*$/.test(s) || s === '' || s === '.' || s === '-') return null;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  /**
   * Aplica separador de milhar ao texto do campo enquanto o usuário digita,
   * preservando a parte decimal exatamente como foi digitada (inclusive uma
   * vírgula recém-teclada, sem casas ainda).
   * "10000"     -> "10.000"
   * "10000,"    -> "10.000,"
   * "10000,5"   -> "10.000,5"
   */
  function groupDigits(text) {
    var s = String(text || '').replace(/[^\d,]/g, '');
    var parts = s.split(',');
    var intPart = parts[0].replace(/^0+(?=\d)/, '');
    var grouped = intPart ? nfGroup.format(parseInt(intPart, 10) || 0) : '';
    if (parts.length === 1) return grouped;
    // Mais de uma vírgula digitada: mantém apenas a primeira.
    var decPart = parts.slice(1).join('').slice(0, 2);
    return (grouped || '0') + ',' + decPart;
  }

  /** Quantidade de dígitos numa string — usado para reposicionar o cursor. */
  function countDigits(s) {
    var m = String(s).match(/\d/g);
    return m ? m.length : 0;
  }

  global.Fmt = {
    money: money, moneySmart: moneySmart, amount: amount, rate: rate, rateBrl: rateBrl,
    parseAmount: parseAmount, groupDigits: groupDigits,
    countDigits: countDigits, plain: plain
  };
})(window);
