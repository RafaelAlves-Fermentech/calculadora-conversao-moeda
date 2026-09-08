/* =============================================================
   bcb-service.js — Acesso às cotações do Banco Central (§22).
   ÚNICA parte do sistema que fala com a rede. A interface nunca chama fetch.

   ---------------------------------------------------------------
   ENDPOINT

   Plataforma Olinda, serviço PTAX v1, recurso CotacaoMoedaPeriodo:

     https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/
     CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)

   Parâmetros aplicados:

     @moeda             'USD' | 'EUR'
     @dataInicial       MM-DD-YYYY  (hoje menos LOOKBACK_DAYS)
     @dataFinalCotacao  MM-DD-YYYY  (hoje)
     $filter            tipoBoletim eq 'Fechamento'    -> PTAX oficial do dia
     $select            cotacaoVenda,dataHoraCotacao   -> só o que usamos
     $orderby           dataHoraCotacao desc           -> mais recente primeiro
     $top               1                              -> só a última
     $format            json

   ---------------------------------------------------------------
   ESTRUTURA DA RESPOSTA  (exemplo real, USD, consultado em 08/09/2026)

     {
       "@odata.context": "...",
       "value": [
         { "cotacaoVenda": 5.08560, "dataHoraCotacao": "2026-09-08 13:02:38.447299" }
       ]
     }

     cotacaoVenda      -> COTAÇÃO DE VENDA. É o único valor que usamos.
     dataHoraCotacao   -> data e hora do boletim; a data sai dos 10 primeiros
                          caracteres ("2026-09-08").

   ---------------------------------------------------------------
   COTAÇÃO DE VENDA, E SOMENTE ELA (§2)

   O campo cotacaoCompra não é pedido ao servidor: o $select traz apenas
   cotacaoVenda e dataHoraCotacao. Não existe caminho no código por onde um
   valor de compra possa entrar. No mesmo boletim de 08/09/2026 o dólar tinha
   compra 5,08500 e venda 5,08560 — a calculadora usa 5,08560.

   ---------------------------------------------------------------
   DIAS SEM COTAÇÃO (§10)

   Sábados, domingos e feriados não têm boletim: a API responde
   {"value": []} para esses dias — verificado em 05–06/09/2026 (fim de
   semana), que retorna vazio. Por isso não perguntamos "qual a cotação de
   hoje?", e sim "qual o último boletim dos últimos LOOKBACK_DAYS dias?".
   O que volta é a última cotação REALMENTE publicada, com a data dela.
   A interface mostra essa data e sinaliza quando é anterior a hoje.
   Nada é interpolado, repetido ou estimado.

   ---------------------------------------------------------------
   CORS

   Verificado em 08/09/2026: o servidor devolve
   Access-Control-Allow-Origin refletindo a origem da requisição, portanto
   o navegador consulta o Banco Central diretamente, sem proxy nem backend.
   Se um dia essa política mudar, o único ponto a adaptar é este arquivo.
   ============================================================= */
(function (global) {
  'use strict';

  var CFG = global.APP_CONFIG;

  /** Moedas que precisam ser consultadas (o Real é a base e vale 1). */
  function foreignCodes() {
    return CFG.ORDER.filter(function (c) { return !CFG.CURRENCIES[c].isBase; });
  }

  function buildUrl(code, from, to) {
    var meta = CFG.CURRENCIES[code];
    return CFG.PTAX_BASE +
      '?@moeda=' + encodeURIComponent("'" + meta.bcbSymbol + "'") +
      '&@dataInicial=' + encodeURIComponent("'" + Dates.toBcb(from) + "'") +
      '&@dataFinalCotacao=' + encodeURIComponent("'" + Dates.toBcb(to) + "'") +
      '&$filter=' + encodeURIComponent("tipoBoletim eq '" + CFG.BULLETIN + "'") +
      '&$select=' + encodeURIComponent(CFG.SELL_FIELD + ',' + CFG.DATE_FIELD) +
      '&$orderby=' + encodeURIComponent(CFG.DATE_FIELD + ' desc') +
      '&$top=1' +
      '&$format=json';
  }

  /**
   * Lê o boletim mais recente da resposta.
   * @returns {{sellRate:number, date:string}|null}  null = resposta sem dados
   *   ou fora do formato esperado (§20: resposta inesperada da fonte).
   */
  function parseLatest(json) {
    if (!json || !Array.isArray(json.value) || json.value.length === 0) return null;
    var row = json.value[0];
    var sell = row[CFG.SELL_FIELD];
    var date = Dates.fromBcbDateTime(row[CFG.DATE_FIELD]);
    if (typeof sell !== 'number' || !isFinite(sell) || sell <= 0) return null;
    if (!date) return null;
    return { sellRate: sell, date: date };
  }

  function fetchLatest(code, from, to) {
    return fetch(buildUrl(code, from, to), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('BCB respondeu ' + res.status);
        return res.json();
      })
      .then(parseLatest);
  }

  /**
   * Busca a última cotação de VENDA de cada moeda estrangeira.
   *
   * @param {{force?:boolean}} opts  force ignora o cache
   * @returns {Promise<{rates:Object, fetchedAt:number, fromCache:boolean,
   *                    stale:boolean, missing:string[]}>}
   *   rates    -> { USD: {sellRate, date}, EUR: {sellRate, date} }
   *   stale    -> true: a rede falhou e estes dados vieram do cache vencido
   *   missing  -> moedas que a fonte não retornou nesta consulta
   *
   * Rejeita apenas quando não há como mostrar nada: rede indisponível e
   * nenhum dado guardado. Nunca inventa cotação (§9).
   */
  function getLatestRates(opts) {
    opts = opts || {};
    var cached = RateCache.get();

    if (cached && cached.fresh && !opts.force) {
      return Promise.resolve({
        rates: cached.rates, fetchedAt: cached.fetchedAt,
        fromCache: true, stale: false, missing: []
      });
    }

    var to = Dates.today();
    var from = Dates.addDays(to, -CFG.LOOKBACK_DAYS);
    var codes = foreignCodes();

    var jobs = codes.map(function (code) {
      return fetchLatest(code, from, to)
        .then(function (r) { return { code: code, data: r, failed: false }; })
        .catch(function () { return { code: code, data: null, failed: true }; });
    });

    return Promise.all(jobs).then(function (results) {
      var rates = {};
      var missing = [];
      var networkFailure = false;

      results.forEach(function (r) {
        if (r.data) rates[r.code] = r.data;
        else { missing.push(r.code); if (r.failed) networkFailure = true; }
      });

      // Nada obtido: cai para o cache vencido, se houver; senão, falha.
      if (Object.keys(rates).length === 0) {
        if (cached) {
          return {
            rates: cached.rates, fetchedAt: cached.fetchedAt,
            fromCache: true, stale: true, missing: []
          };
        }
        var err = new Error(networkFailure ? 'network' : 'empty');
        err.kind = networkFailure ? 'network' : 'empty';
        throw err;
      }

      // Obtido parcialmente: completa o que faltou com o cache, se existir,
      // para não deixar uma moeda em branco por uma falha pontual.
      if (missing.length && cached) {
        missing.slice().forEach(function (code) {
          if (cached.rates[code]) {
            rates[code] = cached.rates[code];
            missing.splice(missing.indexOf(code), 1);
          }
        });
      }

      RateCache.set(rates);
      return {
        rates: rates, fetchedAt: Date.now(),
        fromCache: false, stale: false, missing: missing
      };
    });
  }

  global.BcbService = {
    getLatestRates: getLatestRates,
    buildUrl: buildUrl,
    _parseLatest: parseLatest,
    _foreignCodes: foreignCodes
  };
})(window);
