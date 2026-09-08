/* =============================================================
   converter.js — LÓGICA DE CONVERSÃO. Núcleo do sistema (§4).
   Camada: funções puras. Sem rede, sem DOM, sem formatação.

   Todo o cálculo do sistema passa por aqui. Para mudar a regra de conversão,
   este é o único arquivo a tocar.

   ---------------------------------------------------------------
   MODELO: o Real é o pivô.

   Cada moeda tem uma taxa expressa em REAIS POR UNIDADE:

       BRL -> 1            (por definição)
       USD -> cotacaoVenda do dólar no Banco Central   (ex.: 5,0856)
       EUR -> cotacaoVenda do euro  no Banco Central   (ex.: 5,9130)

   Com isso, qualquer par se resolve com uma fórmula só:

       resultado = valor x (reais por unidade da origem)
                         / (reais por unidade do destino)

   Verificação da fórmula nos casos do briefing:

     USD -> BRL   100  x 5,40 / 1     = 540,00       ✔ (§4)
     BRL -> USD   540  x 1    / 5,40  = 100,00       ✔ (§4)
     EUR -> BRL   100  x 6,30 / 1     = 630,00       ✔ (§4)
     BRL -> EUR   630  x 1    / 6,30  = 100,00       ✔ (§4)
     USD -> EUR   valor x cotUSD / cotEUR            ✔ (§4)
     EUR -> USD   valor x cotEUR / cotUSD            ✔ (§4)
     BRL -> BRL   valor x 1     / 1    = valor       ✔ (§1, mesma moeda)

   PRECISÃO (§17): nada é arredondado aqui. As taxas entram com todas as casas
   publicadas pelo Banco Central e o resultado sai cheio. O arredondamento
   ocorre apenas na exibição, em format.js.
   ============================================================= */
(function (global) {
  'use strict';

  var CFG = global.APP_CONFIG;

  /** Códigos de erro devolvidos por validate(). A mensagem fica na UI. */
  var ERRORS = {
    EMPTY: 'EMPTY',           // campo vazio
    NOT_A_NUMBER: 'NOT_A_NUMBER',
    ZERO: 'ZERO',             // valor igual a zero
    NEGATIVE: 'NEGATIVE',     // valor negativo
    TOO_LARGE: 'TOO_LARGE',   // acima do que faz sentido exibir
    NO_CURRENCY: 'NO_CURRENCY',
    NO_RATE: 'NO_RATE'        // cotação indisponível para a moeda pedida
  };

  /** Acima disso a formatação perde sentido prático (1 quatrilhão). */
  var MAX_AMOUNT = 1e15;

  /**
   * Reais por unidade da moeda.
   * @param {string} code
   * @param {Object} rates  { USD: {sellRate, date}, EUR: {...} }
   * @returns {number|null}
   */
  function brlPerUnit(code, rates) {
    var meta = CFG.CURRENCIES[code];
    if (!meta) return null;
    if (meta.isBase) return 1;
    var entry = rates && rates[code];
    if (!entry || typeof entry.sellRate !== 'number' ||
        !isFinite(entry.sellRate) || entry.sellRate <= 0) return null;
    return entry.sellRate;
  }

  /**
   * Valida a entrada antes de converter.
   * @returns {{ok:true}|{ok:false, error:string}}
   */
  function validate(amount, from, to, rates) {
    if (!CFG.CURRENCIES[from] || !CFG.CURRENCIES[to]) {
      return { ok: false, error: ERRORS.NO_CURRENCY };
    }
    if (amount === null || amount === undefined) return { ok: false, error: ERRORS.EMPTY };
    if (typeof amount !== 'number' || !isFinite(amount)) {
      return { ok: false, error: ERRORS.NOT_A_NUMBER };
    }
    if (amount < 0) return { ok: false, error: ERRORS.NEGATIVE };
    if (amount === 0) return { ok: false, error: ERRORS.ZERO };
    if (amount > MAX_AMOUNT) return { ok: false, error: ERRORS.TOO_LARGE };
    if (brlPerUnit(from, rates) === null || brlPerUnit(to, rates) === null) {
      return { ok: false, error: ERRORS.NO_RATE };
    }
    return { ok: true };
  }

  /**
   * Quanto vale UMA unidade da moeda de origem na moeda de destino.
   * unitRate('USD','BRL', rates) -> 5.0856
   * unitRate('BRL','USD', rates) -> 0.19663...
   * @returns {number|null}
   */
  function unitRate(from, to, rates) {
    var a = brlPerUnit(from, rates);
    var b = brlPerUnit(to, rates);
    if (a === null || b === null) return null;
    return a / b;
  }

  /**
   * Converte um valor entre duas moedas.
   *
   * @param {number} amount  valor na moeda de origem
   * @param {string} from    código da moeda de origem
   * @param {string} to      código da moeda de destino
   * @param {Object} rates   cotações de VENDA do Banco Central
   * @returns {{ok:boolean, value?:number, unitRate?:number, error?:string}}
   */
  function convert(amount, from, to, rates) {
    var check = validate(amount, from, to, rates);
    if (!check.ok) return { ok: false, error: check.error };

    // Mesma moeda na origem e no destino: o valor passa intacto (§1).
    // O atalho evita o ruído de ponto flutuante de multiplicar e dividir pela
    // mesma cotação — 777,77 x 5,0856 / 5,0856 devolveria 777,7700000000001.
    if (from === to) return { ok: true, value: amount, unitRate: 1 };

    var fromBrl = brlPerUnit(from, rates);
    var toBrl = brlPerUnit(to, rates);

    // Multiplica antes de dividir: preserva mais casas significativas.
    var value = (amount * fromBrl) / toBrl;

    return { ok: true, value: value, unitRate: fromBrl / toBrl };
  }

  /**
   * Descreve, em dados, qual cotação sustentou a conversão (§8).
   * Quem formata é a UI; aqui só sai a estrutura.
   *
   * BRL <-> USD  ->  { base:'USD', quote:'BRL', value: 5.0856 }
   *                  (sempre "1 USD = R$ x", mesmo na conversão inversa)
   * USD <-> EUR  ->  taxa direta entre as duas + as duas cotações de apoio
   * BRL <-> BRL  ->  null (não há cotação envolvida)
   */
  function describeRate(from, to, rates) {
    if (from === to) return null;

    var fromMeta = CFG.CURRENCIES[from];
    var toMeta = CFG.CURRENCIES[to];
    if (!fromMeta || !toMeta) return null;

    // Par com o Real: a referência publicada é sempre "1 moeda = R$ x".
    if (fromMeta.isBase || toMeta.isBase) {
      var foreign = fromMeta.isBase ? to : from;
      var v = brlPerUnit(foreign, rates);
      if (v === null) return null;
      return { base: foreign, quote: 'BRL', value: v, support: null };
    }

    // Par entre duas moedas estrangeiras: taxa cruzada via Real.
    var direct = unitRate(from, to, rates);
    if (direct === null) return null;
    return {
      base: from,
      quote: to,
      value: direct,
      support: [
        { code: from, value: brlPerUnit(from, rates) },
        { code: to, value: brlPerUnit(to, rates) }
      ]
    };
  }

  global.Converter = {
    convert: convert,
    unitRate: unitRate,
    validate: validate,
    describeRate: describeRate,
    brlPerUnit: brlPerUnit,
    ERRORS: ERRORS,
    MAX_AMOUNT: MAX_AMOUNT
  };
})(window);
