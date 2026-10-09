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
     $filter            tipoBoletim eq 'Fechamento'
     $orderby           dataHoraCotacao desc
     $top               1
     $format            json

   ---------------------------------------------------------------
   POR QUE NÃO EXISTE $select AQUI  (incidente de 09/10/2026)

   Até 08/09/2026 a consulta trazia `$select=cotacaoVenda,dataHoraCotacao`,
   para baixar só os dois campos usados. Em algum momento até 09/10/2026 o
   Banco Central passou a responder **HTTP 403 Forbidden** — com uma página
   HTML de erro, não JSON — a QUALQUER requisição que use `$select`, seja qual
   for o campo pedido e esteja a vírgula codificada ou não. Sem `$select`, a
   mesma consulta responde 200 normalmente.

   Isso derrubou a calculadora: nenhuma cotação carregava.

   Consequência a ter em mente: sem `$select`, a resposta passa a trazer
   também `cotacaoCompra`. Ela chega ao navegador, mas NÃO entra no sistema —
   ver "COTAÇÃO DE VENDA" logo abaixo.

   ---------------------------------------------------------------
   RESILIÊNCIA: DUAS TENTATIVAS

   O episódio acima mostrou que as opções OData do servidor são terreno
   movediço: elas são comodidade, não necessidade. Por isso cada consulta tem
   um plano B.

     1ª tentativa — consulta completa, com $filter, $orderby e $top.
     2ª tentativa — consulta MÍNIMA: só a moeda, o período e $format=json.

   A segunda só dispara se a primeira falhar, e pede ao servidor o mínimo que
   o endpoint sabe fazer. Se amanhã o Banco Central recusar `$filter` ou
   `$orderby` como recusou `$select`, a calculadora continua funcionando.

   O preço é baixar alguns registros a mais numa situação de exceção, e a
   seleção do boletim certo não depende disso: ela é sempre feita aqui no
   cliente (ver pickLatestClosing).

   ---------------------------------------------------------------
   ESTRUTURA DA RESPOSTA  (exemplo real, USD, consultado em 09/10/2026)

     {
       "value": [
         { "paridadeCompra": 1.0, "paridadeVenda": 1.0,
           "cotacaoCompra": 4.98860, "cotacaoVenda": 4.98920,
           "dataHoraCotacao": "2026-10-09 13:07:30.746597",
           "tipoBoletim": "Fechamento" }
       ]
     }

     cotacaoVenda      -> COTAÇÃO DE VENDA. É o único valor que usamos.
     cotacaoCompra     -> cotação de compra. IGNORADA (§2).
     dataHoraCotacao   -> data e hora do boletim; a data sai dos 10 primeiros
                          caracteres ("2026-10-09").
     tipoBoletim       -> qual boletim é. Só 'Fechamento' interessa.

   ---------------------------------------------------------------
   COTAÇÃO DE VENDA, E SOMENTE ELA (§2)

   Antes, a garantia era estrutural: o `$select` impedia a cotação de compra
   de sair do servidor. Com o `$select` barrado, ela passa a chegar junto, e a
   garantia passa a ser do código: `pickLatestClosing` lê exclusivamente
   CFG.SELL_FIELD e em nenhum ponto toca em `cotacaoCompra`. O valor
   trafega na resposta e é descartado.

   No boletim de 09/10/2026 o dólar tinha compra 4,98860 e venda 4,98920 — a
   calculadora usa 4,98920.

   ---------------------------------------------------------------
   O BOLETIM CERTO

   A API devolve VÁRIOS boletins por dia, com valores diferentes. Em
   09/10/2026 o dólar teve Abertura 5,00180, seis Intermediários e Fechamento
   4,98920. Pegar o registro errado daria uma cotação errada — e plausível,
   que é pior.

   Por isso o filtro por `tipoBoletim === 'Fechamento'` e a escolha do mais
   recente são SEMPRE refeitos aqui, mesmo quando o servidor já filtrou e
   ordenou. O que vem do servidor é tratado como sugestão; a conferência é
   nossa.

   ---------------------------------------------------------------
   DIAS SEM COTAÇÃO (§10)

   Sábados, domingos e feriados não têm boletim: a API responde
   {"value": []} para esses dias. Por isso não perguntamos "qual a cotação de
   hoje?", e sim "qual o último boletim dos últimos LOOKBACK_DAYS dias?".
   O que volta é a última cotação REALMENTE publicada, com a data dela.
   A interface mostra essa data e sinaliza quando é anterior a hoje.
   Nada é interpolado, repetido ou estimado.

   ---------------------------------------------------------------
   CORS

   Verificado em 09/10/2026, inclusive a partir do domínio de produção: o
   servidor devolve Access-Control-Allow-Origin refletindo a origem da
   requisição, portanto o navegador consulta o Banco Central diretamente, sem
   proxy nem backend. Se um dia essa política mudar, o único ponto a adaptar é
   este arquivo.
   ============================================================= */
(function (global) {
  'use strict';

  var CFG = global.APP_CONFIG;

  /** Moedas que precisam ser consultadas (o Real é a base e vale 1). */
  function foreignCodes() {
    return CFG.ORDER.filter(function (c) { return !CFG.CURRENCIES[c].isBase; });
  }

  /**
   * Monta a URL da consulta.
   * @param {boolean} minimal  true = só moeda, período e formato (plano B).
   */
  function buildUrl(code, from, to, minimal) {
    var meta = CFG.CURRENCIES[code];
    var url = CFG.PTAX_BASE +
      '?@moeda=' + encodeURIComponent("'" + meta.bcbSymbol + "'") +
      '&@dataInicial=' + encodeURIComponent("'" + Dates.toBcb(from) + "'") +
      '&@dataFinalCotacao=' + encodeURIComponent("'" + Dates.toBcb(to) + "'");

    if (!minimal) {
      url += '&$filter=' + encodeURIComponent(CFG.BULLETIN_FIELD + " eq '" + CFG.BULLETIN + "'") +
             '&$orderby=' + encodeURIComponent(CFG.DATE_FIELD + ' desc') +
             '&$top=1';
    }
    return url + '&$format=json';
  }

  /**
   * Escolhe, entre os registros devolvidos, o boletim de FECHAMENTO mais
   * recente, e dele lê apenas a cotação de venda e a data.
   *
   * Funciona igual para a consulta completa e para a mínima: é aqui que a
   * correção acontece, não na confiança no servidor.
   *
   * @returns {{sellRate:number, date:string}|null}  null = sem dado utilizável
   *   (período sem boletim, ou resposta fora do formato esperado — §20).
   */
  function pickLatestClosing(json) {
    if (!json || !Array.isArray(json.value) || json.value.length === 0) return null;

    var melhor = null;
    for (var i = 0; i < json.value.length; i++) {
      var row = json.value[i];
      if (!row || typeof row !== 'object') continue;

      // Só o boletim de fechamento é a PTAX oficial do dia.
      if (String(row[CFG.BULLETIN_FIELD]) !== CFG.BULLETIN) continue;

      // Lê a cotação de VENDA. `cotacaoCompra` nunca é consultada (§2).
      var sell = row[CFG.SELL_FIELD];
      if (typeof sell !== 'number' || !isFinite(sell) || sell <= 0) continue;

      var carimbo = row[CFG.DATE_FIELD];
      var date = Dates.fromBcbDateTime(carimbo);
      if (!date) continue;

      // Mais recente por data e hora completas: num mesmo dia pode haver mais
      // de um registro, e a ordem da resposta não é garantida.
      if (!melhor || String(carimbo) > String(melhor.carimbo)) {
        melhor = { sellRate: sell, date: date, carimbo: String(carimbo) };
      }
    }

    return melhor ? { sellRate: melhor.sellRate, date: melhor.date } : null;
  }

  function pedir(url) {
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) {
        // 403 com página HTML foi exatamente o sintoma do incidente de
        // 09/10/2026. O status entra no erro para facilitar o diagnóstico.
        var err = new Error('BCB respondeu ' + res.status);
        err.status = res.status;
        throw err;
      }
      return res.json();
    });
  }

  /**
   * Busca o último boletim de fechamento de uma moeda, com plano B.
   * @returns {Promise<{data:Object|null, viaFallback:boolean}>}
   */
  function fetchLatest(code, from, to) {
    return pedir(buildUrl(code, from, to, false))
      .then(function (json) {
        return { data: pickLatestClosing(json), viaFallback: false };
      })
      .catch(function (erroCompleto) {
        // A consulta completa falhou. Tenta a mínima antes de desistir: pode
        // ser mais uma opção OData recusada pelo servidor.
        return pedir(buildUrl(code, from, to, true))
          .then(function (json) {
            return { data: pickLatestClosing(json), viaFallback: true };
          })
          .catch(function () {
            // As duas falharam: o erro que interessa é o da consulta normal.
            throw erroCompleto;
          });
      });
  }

  /**
   * Busca a última cotação de VENDA de cada moeda estrangeira.
   *
   * @param {{force?:boolean}} opts  force ignora o cache
   * @returns {Promise<{rates:Object, fetchedAt:number, fromCache:boolean,
   *                    stale:boolean, missing:string[], viaFallback:boolean}>}
   *   rates       -> { USD: {sellRate, date}, EUR: {sellRate, date} }
   *   stale       -> true: a rede falhou e estes dados vieram do cache vencido
   *   missing     -> moedas que a fonte não retornou nesta consulta
   *   viaFallback -> true: a consulta completa falhou e o plano B salvou
   *
   * Rejeita apenas quando não há como mostrar nada: fonte indisponível e
   * nenhum dado guardado. Nunca inventa cotação (§9).
   */
  function getLatestRates(opts) {
    opts = opts || {};
    var cached = RateCache.get();

    if (cached && cached.fresh && !opts.force) {
      return Promise.resolve({
        rates: cached.rates, fetchedAt: cached.fetchedAt,
        fromCache: true, stale: false, missing: [], viaFallback: false
      });
    }

    var to = Dates.today();
    var from = Dates.addDays(to, -CFG.LOOKBACK_DAYS);
    var codes = foreignCodes();

    var jobs = codes.map(function (code) {
      return fetchLatest(code, from, to)
        .then(function (r) {
          return { code: code, data: r.data, failed: false, viaFallback: r.viaFallback };
        })
        .catch(function (err) {
          return { code: code, data: null, failed: true, viaFallback: false, erro: err };
        });
    });

    return Promise.all(jobs).then(function (results) {
      var rates = {};
      var missing = [];
      var networkFailure = false;
      var viaFallback = false;
      var ultimoErro = null;

      results.forEach(function (r) {
        if (r.viaFallback) viaFallback = true;
        if (r.data) rates[r.code] = r.data;
        else {
          missing.push(r.code);
          if (r.failed) { networkFailure = true; ultimoErro = r.erro; }
        }
      });

      // Nada obtido: cai para o cache vencido, se houver; senão, falha.
      if (Object.keys(rates).length === 0) {
        if (cached) {
          return {
            rates: cached.rates, fetchedAt: cached.fetchedAt,
            fromCache: true, stale: true, missing: [], viaFallback: false
          };
        }
        var err = new Error(networkFailure ? 'network' : 'empty');
        err.kind = networkFailure ? 'network' : 'empty';
        // Guarda o status HTTP, quando houver: distingue "sem internet" de
        // "a fonte recusou a consulta", que pedem reações diferentes.
        err.status = ultimoErro && ultimoErro.status;
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
        fromCache: false, stale: false, missing: missing, viaFallback: viaFallback
      };
    });
  }

  global.BcbService = {
    getLatestRates: getLatestRates,
    buildUrl: buildUrl,
    _pickLatestClosing: pickLatestClosing,
    _foreignCodes: foreignCodes
  };
})(window);
