/* =============================================================
   config.js — Configuração da calculadora.
   Camada: constantes. Sem rede, sem DOM, sem lógica.

   PARA ADICIONAR UMA MOEDA no futuro, basta acrescentar uma entrada em
   CURRENCIES e o código dela em ORDER. Nada mais precisa mudar: a busca de
   cotações, os seletores, a conversão e o painel percorrem estas listas.
   ============================================================= */
(function (global) {
  'use strict';

  /**
   * Recurso oficial do Banco Central — plataforma Olinda, serviço PTAX v1.
   * Documentação: https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/documentacao
   * Página de referência ao usuário:
   *   https://www.bcb.gov.br/estabilidadefinanceira/historicocotacoes
   *
   * Usamos CotacaoMoedaPeriodo (e não CotacaoDolarPeriodo) porque ele aceita o
   * parâmetro `moeda`, atendendo USD e EUR pelo mesmo caminho, e expõe
   * `tipoBoletim`, permitindo isolar o boletim de FECHAMENTO — a PTAX oficial
   * do dia.
   *
   * ESTRUTURA DA RESPOSTA (verificada em 08/09/2026):
   *   { "value": [
   *       { "cotacaoVenda": 5.08560, "dataHoraCotacao": "2026-09-08 13:02:38.447299" }
   *   ] }
   *
   * CORS: verificado em 08/09/2026 — o servidor responde com
   * `Access-Control-Allow-Origin` refletindo a origem da requisição, portanto
   * o navegador consulta o Banco Central diretamente. Não há backend
   * intermediário nem proxy: a fonte é o BCB, sem intermediários.
   */
  var PTAX_BASE =
    'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/' +
    'CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)';

  /**
   * Moedas suportadas.
   *
   * `rateInBrl: 1` marca a moeda-base (o Real). As demais têm a cotação
   * buscada no Banco Central. `bcbSymbol` é o valor do parâmetro `moeda`.
   */
  var CURRENCIES = {
    BRL: {
      code: 'BRL',
      name: 'Real Brasileiro',
      shortName: 'Real',
      symbol: 'R$',
      isBase: true,          // não é consultada no BCB: vale 1 por definição
      bcbSymbol: null,
      locale: 'pt-BR'
    },
    USD: {
      code: 'USD',
      name: 'Dólar Americano',
      shortName: 'Dólar dos EUA',
      symbol: 'US$',
      isBase: false,
      bcbSymbol: 'USD',
      firstAvailable: '1990-01-02'
    },
    EUR: {
      code: 'EUR',
      name: 'Euro',
      shortName: 'Euro',
      symbol: '\u20AC',
      isBase: false,
      bcbSymbol: 'EUR',
      firstAvailable: '1998-12-31'
    }
  };

  global.APP_CONFIG = {
    PTAX_BASE: PTAX_BASE,

    /** Boletim que representa a PTAX oficial de fechamento do dia. */
    BULLETIN: 'Fechamento',

    /**
     * Campo da resposta que representa a COTAÇÃO DE VENDA.
     * A cotação de COMPRA (`cotacaoCompra`) nunca é usada — e sequer é pedida
     * ao servidor, graças ao $select montado em bcb-service.js.
     */
    SELL_FIELD: 'cotacaoVenda',

    /** Campo da resposta com a data/hora do boletim. */
    DATE_FIELD: 'dataHoraCotacao',

    CURRENCIES: CURRENCIES,

    /** Ordem de exibição nos seletores e no painel de cotações. */
    ORDER: ['BRL', 'USD', 'EUR'],

    /**
     * Quantos dias para trás procurar a última cotação disponível.
     * Cobre fins de semana, feriados prolongados e recessos. 15 dias é
     * folgado: o maior intervalo sem boletim no calendário brasileiro
     * (Natal/Ano Novo emendado a fim de semana) não passa de 5 dias.
     */
    LOOKBACK_DAYS: 15,

    /** Casas decimais das cotações exibidas (§16). */
    RATE_DECIMALS: 4,

    /** Estado inicial da calculadora. */
    DEFAULT_FROM: 'BRL',
    DEFAULT_TO: 'USD',

    /** Máximo de itens guardados em "Conversões recentes". */
    HISTORY_LIMIT: 8
  };
})(window);
