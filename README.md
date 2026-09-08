# Conversor de Moedas — Fermentech

Ferramenta interna para conversão entre **Real (BRL)**, **Dólar dos EUA (USD)** e
**Euro (EUR)**, usando a **cotação de venda** oficial do **Banco Central do Brasil**.

O usuário informa um valor, escolhe as moedas e vê o resultado imediatamente,
junto com a cotação exata que foi usada e a data do boletim.

---

## Como executar

Não há build, dependência nem instalação.

**Opção 1 — abrir direto:** dê duplo clique em `index.html`.

**Opção 2 — servir por HTTP** (recomendada):

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Depois abra <http://localhost:8124/>.

A segunda opção é preferível porque, servida por `http://localhost`, a página é
tratada como origem segura pelo navegador e o botão **Copiar resultado** usa a
API moderna de área de transferência. Aberta por `file://`, a cópia recai no
método antigo — que funciona, mas é menos garantido conforme o navegador.

---

## Aparência clara e escura

O botão de sol/lua no cabeçalho alterna entre as duas aparências. A escolha fica
guardada no navegador e vale para as próximas visitas.

**Quem nunca escolheu segue o sistema operacional.** Se o Windows (ou o celular)
está no modo escuro, a ferramenta abre escura; se o sistema trocar com a página
aberta, ela acompanha. A partir do primeiro clique no botão, a preferência
manual passa a mandar.

Como isso é feito:

| Peça | Papel |
|---|---|
| Script embutido no `<head>` do `index.html` | Aplica a aparência **antes de a página desenhar**, para a tela não piscar branca em quem usa o modo escuro |
| `src/theme.js` | Botão, persistência e acompanhamento do sistema |
| `:root[data-theme="dark"]` no CSS | Redefine **só os tokens** — nenhuma regra de componente é reescrita |
| `assets/fermentech-branco.png` | Versão da marca para fundo escuro (a colorida não se lê ali) |

O contraste foi medido na página renderizada, elemento por elemento, **nas duas
aparências**: 33 pares de texto e fundo em cada, todos aprovados no WCAG AA.

> **Detalhe de implementação que vale saber, se for mexer no CSS:** nenhuma
> transição anima `background` ou `color`, e `src/theme.js` força um recálculo
> de estilo ao trocar de tema. Isso não é preciosismo — sem essas duas medidas,
> as propriedades cujo valor vem de uma variável (`background: var(--card)`)
> congelavam na cor do tema anterior até a página ser recarregada. O defeito
> aparecia no campo de valor e nos botões do cabeçalho.

---

## Repositório e publicação

| | |
|---|---|
| **Ferramenta no ar** | <https://calculadora-conversao-moeda.vercel.app/> |
| **Código** | <https://github.com/RafaelAlves-Fermentech/calculadora-conversao-moeda> |

O Vercel está ligado ao repositório: **todo `git push` na branch `main` publica
sozinho**, em cerca de um minuto. Não há passo manual de deploy.

### A cotação NÃO exige atualização diária do repositório

Vale insistir neste ponto, porque é contraintuitivo: **não existe nenhum arquivo
de cotação neste projeto.**

A página consulta o Banco Central **ao vivo, no navegador de quem a abre**. Quem
abrir a ferramenta amanhã de manhã verá o boletim de amanhã, sem que ninguém
tenha commitado coisa alguma. Não há rotina diária, não há tarefa agendada, não
há arquivo a regravar.

O repositório só muda quando **o código** muda — um ajuste na interface, uma
moeda nova, uma correção.

### Como publicar uma alteração

```bash
powershell -ExecutionPolicy Bypass -File publicar.ps1 "o que mudou"
```

O script confere se há algo a publicar, mostra os arquivos alterados, cria o
commit e envia. Se preferir os comandos diretos:

```bash
git add -A
git commit -m "o que mudou"
git push
```

### Como a equipe acessa

Pelo endereço do Vercel, no navegador — sem instalar nada e sem rodar
`serve.ps1`. O `serve.ps1` serve para desenvolvimento e testes locais.

A cotação é buscada ao vivo pelo navegador de cada pessoa, direto no Banco
Central, então o endereço publicado mostra sempre o boletim mais recente.

> A ferramenta é pública na internet. Não há problema de sigilo: ela não guarda
> credenciais, chaves nem dados de clientes, e consulta apenas um endpoint
> público do Banco Central. Se um dia for preciso restringir o acesso, o Vercel
> oferece proteção por senha nos planos pagos; a alternativa gratuita é servir a
> pasta de um compartilhamento de rede interno.

### Convenções do repositório

| Item | Definição |
|---|---|
| Branch principal | `main` |
| Fim de linha | LF no repositório, CRLF nos `.ps1` locais (`.gitattributes`) |
| Fora do versionamento | `.claude/`, logs, temporários, `node_modules/` (`.gitignore`) |

Nada sensível é versionado: a ferramenta não tem credenciais, chaves, senhas nem
dados de clientes — só consulta um endpoint público do Banco Central.

---

## Fonte das cotações

Página de referência ao usuário:
<https://www.bcb.gov.br/estabilidadefinanceira/historicocotacoes>

Endpoint efetivamente consultado — plataforma **Olinda**, serviço **PTAX v1**,
recurso `CotacaoMoedaPeriodo`:

```
https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/
CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)
```

| Parâmetro | Valor |
|---|---|
| `@moeda` | `'USD'` ou `'EUR'` |
| `@dataInicial` | hoje menos 15 dias, no formato `MM-DD-YYYY` |
| `@dataFinalCotacao` | hoje, no formato `MM-DD-YYYY` |
| `$filter` | `tipoBoletim eq 'Fechamento'` |
| `$select` | `cotacaoVenda,dataHoraCotacao` |
| `$orderby` | `dataHoraCotacao desc` |
| `$top` | `1` |
| `$format` | `json` |

`CotacaoMoedaPeriodo` foi escolhido em vez de `CotacaoDolarPeriodo` porque aceita
o parâmetro `moeda` — atendendo às duas moedas pelo mesmo caminho — e expõe
`tipoBoletim`, permitindo isolar o boletim de **Fechamento**, que é a PTAX
oficial do dia.

### Estrutura da resposta

```json
{
  "value": [
    { "cotacaoVenda": 5.08560, "dataHoraCotacao": "2026-09-08 13:02:38.447299" }
  ]
}
```

| Campo | Significado |
|---|---|
| `cotacaoVenda` | **A cotação de venda.** É o único valor usado nos cálculos. |
| `dataHoraCotacao` | Data e hora do boletim. A data sai dos 10 primeiros caracteres. |

### Somente a cotação de venda

O campo `cotacaoCompra` **não é sequer pedido ao servidor**: o `$select` traz
apenas `cotacaoVenda` e `dataHoraCotacao`. Não existe caminho no código por onde
um valor de compra possa entrar — a palavra "compra" aparece no código-fonte
somente em comentários.

Exemplo verificado em 08/09/2026: o boletim do dólar trazia
`cotacaoCompra = 5,08500` e `cotacaoVenda = 5,08560`. A calculadora usa
**5,0856**.

### CORS

Verificado em 08/09/2026: o servidor do Banco Central responde com
`Access-Control-Allow-Origin` refletindo a origem da requisição. Por isso **não
existe backend, proxy ou camada intermediária** — o navegador fala direto com o
Banco Central, e a fonte permanece sendo a fonte oficial, sem intermediários.

Se um dia essa política mudar, o único arquivo a adaptar é `src/bcb-service.js`,
que é o único ponto do sistema que acessa a rede.

### Dias sem cotação

Sábados, domingos e feriados não têm boletim: a API responde `{"value": []}`
para essas datas (verificado em 05–06/09/2026, um fim de semana).

Por isso a aplicação **não pergunta "qual a cotação de hoje?"**, e sim
**"qual o último boletim publicado nos últimos 15 dias?"** — daí o `$orderby`
decrescente com `$top=1`. O que volta é a última cotação realmente publicada,
acompanhada da data dela.

Quando essa data é anterior a hoje, a interface avisa em destaque:

> **Última cotação disponível: 04/09/2026.**
> O Banco Central ainda não publicou boletim para hoje. A conversão usa a
> cotação de venda dessa data.

E o cartão da moeda troca o selo "Hoje" por "Última disponível". Nada é
interpolado, repetido ou estimado.

> A PTAX de fechamento sai por volta das 13h. Antes disso, num dia útil, o
> último boletim ainda é o do dia anterior — e a aplicação diz isso claramente.

---

## Como funciona a conversão

Toda a lógica está em **`src/converter.js`**. É o único arquivo a tocar para
mudar a regra de cálculo.

O **Real é o pivô**. Cada moeda tem uma taxa em *reais por unidade*:

```
BRL -> 1                                    (por definição)
USD -> cotacaoVenda do dólar no BCB         (ex.: 5,0856)
EUR -> cotacaoVenda do euro  no BCB         (ex.: 5,9130)
```

Com isso, **todos os pares se resolvem com uma fórmula só**:

```
resultado = valor × (reais por unidade da origem) ÷ (reais por unidade do destino)
```

| Conversão | Cálculo | Exemplo (cotações de 08/09/2026) |
|---|---|---|
| USD → BRL | `valor × cotUSD` | US$ 10.000 → R$ 50.856,00 |
| BRL → USD | `valor ÷ cotUSD` | R$ 10.000 → US$ 1.966,34 |
| EUR → BRL | `valor × cotEUR` | € 10.000 → R$ 59.130,00 |
| BRL → EUR | `valor ÷ cotEUR` | R$ 10.000 → € 1.691,19 |
| USD → EUR | `valor × cotUSD ÷ cotEUR` | US$ 10.000 → € 8.600,71 |
| EUR → USD | `valor × cotEUR ÷ cotUSD` | € 10.000 → US$ 11.626,95 |
| Mesma moeda | valor devolvido intacto | R$ 10.000 → R$ 10.000,00 |

### Precisão

As cotações entram no cálculo **com todas as casas publicadas** pelo Banco
Central. Nada é arredondado no meio do caminho: o arredondamento acontece
somente na exibição, em `src/format.js`.

Duas consequências práticas:

- Converter ida e volta devolve o valor original exato
  (R$ 10.000 → USD → BRL = R$ 10.000,00).
- Valores pequenos não viram "zero falso": R$ 0,01 em dólar é exibido como
  **US$ 0,001966**, e não como US$ 0,00.

Quando origem e destino são a mesma moeda, o valor passa intacto por um atalho —
multiplicar e dividir pela mesma cotação introduziria ruído de ponto flutuante
(777,77 viraria 777,7700000000001).

---

## Arquitetura

Camadas separadas, cada arquivo dependendo apenas dos anteriores. **Nenhum
componente visual acessa a rede.**

```
API BCB (Olinda / PTAX)
  └─ src/bcb-service.js   único fetch do sistema
       └─ src/cache.js    validade por situação (localStorage)
            └─ src/converter.js   cálculo puro
                 └─ src/app.js    estado e interface

src/theme.js   aparência clara/escura, independente das camadas acima
```

| Arquivo | Responsabilidade |
|---|---|
| `src/config.js` | Endpoint, moedas, constantes. **Ponto de extensão.** |
| `src/dates.js` | Datas, formato do BCB, rótulos |
| `src/format.js` | Formatação brasileira e leitura do valor digitado |
| `src/cache.js` | Cache das cotações, com validade diferenciada |
| `src/bcb-service.js` | Acesso ao Banco Central, leitura da resposta |
| `src/converter.js` | **Lógica de conversão** e validação |
| `src/history.js` | Conversões recentes (localStorage) |
| `src/theme.js` | Aparência clara/escura |
| `src/app.js` | Interface, estado, eventos |
| `assets/styles.css` | Folha de estilo única |
| `index.html` | Estrutura da página |

### Modelo de dados

```js
{ USD: { sellRate: 5.0856, date: "2026-09-08" },
  EUR: { sellRate: 5.9130, date: "2026-09-08" } }
```

O campo é `sellRate`. **Não existe `buyRate` no modelo.**

---

## Cache

Chave única em `localStorage`, com validade que depende da situação:

| Situação | Validade | Motivo |
|---|---|---|
| A última cotação já é de **hoje** | 6 horas | O boletim do dia saiu e não muda mais |
| A última cotação é de um dia **anterior** | 20 minutos | Pode ser fim de semana, feriado, ou antes das 13h |

O botão **Atualizar** ignora o cache e consulta o Banco Central de novo.

Comportamento verificado: primeira carga faz 2 requisições (uma por moeda);
recargas seguintes fazem **0**; "Atualizar" força 2 novamente.

Um registro vencido não é descartado — se o Banco Central estiver fora do ar,
ele é exibido **com aviso explícito** de que veio da consulta anterior.

---

## Tratamento de erros

Nenhuma mensagem técnica chega ao usuário, e **nenhuma cotação é inventada**.

| Situação | O que acontece |
|---|---|
| Campo vazio | "Informe um valor para converter." |
| Valor zero | "Informe um valor maior que zero." |
| Valor negativo | O campo não aceita o sinal; a lógica também recusa |
| Texto inválido | Descartado pela máscara do campo |
| Valor absurdamente alto | "Valor muito alto para converter." |
| **Fonte fora do ar, sem cache** | Aviso vermelho + "Tentar novamente"; **calculadora bloqueada** |
| **Fonte fora do ar, com cache** | Dados exibidos com aviso de que são da consulta anterior |
| Só uma das moedas falhou | A outra continua funcionando; aviso nomeia a que faltou |
| Resposta fora do formato esperado | Tratada como ausência de dado, sem quebrar a página |

A mensagem de falha total é exatamente a pedida:

> Não foi possível atualizar as cotações do Banco Central. Verifique sua conexão
> ou tente novamente.

---

## Como manter e evoluir

### Adicionar uma moeda

Basta editar `src/config.js`:

1. Acrescente a entrada em `CURRENCIES` com `code`, `name`, `shortName`,
   `symbol`, `bcbSymbol` (o código aceito pela PTAX) e `isBase: false`.
2. Inclua o código em `ORDER`.

Nada mais precisa mudar. Os seletores, a busca de cotações, a conversão e o
painel percorrem essas listas.

### Trocar a fonte das cotações

Reescreva apenas `src/bcb-service.js`, mantendo a assinatura de
`getLatestRates()`. Nenhum outro arquivo acessa a rede.

### Mudar a regra de cálculo

Apenas `src/converter.js`.

### Mudar a aparência

Os tokens de cor e tipografia estão no topo de `assets/styles.css`.

---

## Verificações realizadas

Todas com cotações reais de 08/09/2026 (USD 5,0856 / EUR 5,9130).

**Conversões** — os seis pares mais a mesma moeda, conferidos na mão e contra os
exemplos do próprio briefing (`1 USD = 5,40` e `1 EUR = 6,30`): todos exatos.
Ida e volta preserva o valor original.

**Entradas** — campo vazio, zero, `0,00`, negativo colado, texto, decimais
(`1.234,56`), valor alto (`999.999.999,99`), um centavo, ponto teclado como
decimal (`1234.56` → `1.234,56`), pontos colados como milhar (`1.234.567`).

**Campo de valor, tecla a tecla** — a máscara foi verificada simulando
digitação humana (um evento por tecla), e não inserção do texto pronto: 15
sequências de digitação, backspace do fim ao começo, inserção no meio do
número com conferência da posição do cursor, e backspace sobre o separador de
milhar. Esse teste revelou um defeito que a inserção em bloco escondia — a
regra que adivinhava se o ponto era decimal reinterpretava o separador que a
própria máscara havia inserido, e digitar `12345` produzia `1,23`. A regra foi
substituída por uma que decide na tecla, e as 15 sequências passam.

**Falhas da fonte** — sem cache (bloqueio + mensagem), com cache (contingência
avisada), falha de apenas uma moeda, e recuperação pelo "Tentar novamente".

**Fim de semana / feriado** — simulado boletim de 04/09 com data corrente
08/09: aviso "Última cotação disponível" e selo trocado nos cartões.

**Cache** — 2 requisições na primeira carga, 0 nas recargas, 2 ao forçar.

**Interface** — console sem erros ou avisos; conversão automática ao digitar;
inversão recalculando na hora; cópia com retorno visual; histórico persistindo
entre recargas.

**Aparência clara/escura** — seis trocas seguidas conferindo, a cada uma, o
fundo e a cor de texto dos elementos que congelavam; carga direta em cada tema;
persistência entre recargas; leitura da preferência do sistema; troca do logo. As
conversões e a máscara do campo foram reconferidas depois de tudo, sem regressão.

**Responsividade** — 375×812 (celular), 768×1024 (tablet) e 1280×800 (desktop),
sem rolagem horizontal em nenhuma; alvos de toque de 48px no celular. No celular
o cabeçalho foi reajustado para acomodar o botão de aparência sem quebrar o
título em duas linhas.

**Acessibilidade** — rótulo em todos os campos, ordem de tabulação lógica, nome
acessível em todos os botões, regiões `aria-live` para resultado e avisos,
`lang="pt-BR"`, landmarks semânticos. O botão de aparência é um interruptor com
`aria-pressed` e rótulo que descreve a ação. Contraste medido na página
renderizada, **nas duas aparências** (33 pares de texto e fundo em cada):
**todos os textos passam no WCAG AA** (mínimo encontrado: 3,12:1 no botão
Converter, que qualifica como texto grande a 19px/700, onde a exigência é 3:1).

---

## Limitações conhecidas

- **A PTAX de fechamento só existe após a publicação do boletim, por volta das
  13h.** Antes disso, num dia útil, a cotação exibida é a do dia anterior — e a
  interface diz isso explicitamente.
- **Não há fonte alternativa.** Se o Banco Central estiver fora do ar, a
  aplicação mostra o cache (avisando) ou uma mensagem de erro. Nenhum outro
  provedor é consultado e nenhum valor é estimado.
- **O campo de valor aceita até 2 casas decimais**, como convém a valores
  monetários. Dígitos além disso não entram — e o usuário vê isso na hora, já
  que o campo é formatado enquanto ele digita.
- **O ponto tem dois papéis, conforme a origem.** Teclado pelo usuário, ele
  vira a vírgula decimal — é a tecla decimal do teclado numérico, e digitar
  `1234.56` produz `1.234,56`. Já num texto colado, o ponto é lido como
  separador de milhar, que é o seu papel no padrão brasileiro: colar
  `1.234.567` dá 1.234.567. A consequência é que colar um valor em formato
  norte-americano (`1,234.56`) não é interpretado corretamente.
- O cache e o histórico usam `localStorage`. Em navegação privada ou com
  armazenamento bloqueado, a aplicação continua funcionando, mas o cache vale
  só para a sessão e o histórico não persiste.

---

## Melhorias futuras recomendadas

1. **Conversão com data específica** — escolher a data e usar o boletim daquele
   dia. A infraestrutura já está pronta: `CotacaoMoedaPeriodo` recebe intervalo
   de datas, e `bcb-service.js` só precisaria expor um `getRatesAt(data)`.
2. **Mais moedas** — libra, peso argentino, franco suíço. Todas existem na PTAX
   e entram apenas por `config.js`.
3. **Variação do dia** — mostrar quanto a cotação subiu ou caiu em relação ao
   boletim anterior, com glifo e palavra além da cor.
4. **Exportar o histórico** em CSV, para colar em planilha.
5. **Integração com o painel "Histórico de Cotações"** — as duas ferramentas
   consultam o mesmo endpoint e compartilham identidade visual; um link entre
   elas, ou um cache comum, evitaria consultas repetidas.
6. **Fixar a página como atalho** no navegador da equipe, ou publicá-la num
   caminho de rede interno, para que todos usem a mesma versão.
7. **Registrar a cotação usada junto de propostas comerciais** — hoje o usuário
   copia o resultado; copiar também a linha "1 USD = R$ 5,0856 — boletim de
   08/09/2026" documentaria a negociação.

---

Fonte das cotações: **Banco Central do Brasil** — utilizada a cotação de
**venda**.
