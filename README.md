# Rateio por GP

Aplicativo para calcular o **rateio de custos por GP (Centro de Custo)**, rodando
**100% no navegador** (sem servidor). Estão implementados os rateios de
**Plano de Saúde** e **Férias**; Rescisão e 13º permanecem preparados para
evoluções futuras.

**App online:** https://marlonpasseri.github.io/APP-Rateio/

## Como usar

1. Abra a URL acima (ou rode localmente — veja abaixo).
2. Na tela:
   1. **Tipo de rateio** → Plano de Saúde.
   2. **Importar a planilha TS** (.xlsx) — reimportada por completo todo mês.
   3. **Dados do boleto** → importe o PDF para preencher tudo automaticamente
      ou informe seguradora, código, mês e valor manualmente.
   4. **Valores** → os valores por família encontrados no PDF são associados
      aos colaboradores da TS; também podem ser ajustados manualmente.
   5. **Calcular** → confira a tabela e clique em **Baixar planilha**.

O arquivo baixado segue o padrão `AA-MM-Seguradora-codigo_boleto.xlsx`
(ex.: `25-01-Bradesco-BoletoX123.xlsx`).

### Importar boleto PDF

Depois de carregar a TS, use **Importar boleto(s)** nos dados do boleto. É
possível selecionar vários PDFs de uma só vez, desde que pertençam à mesma
competência. No layout atual da SulAmérica, o app extrai automaticamente:

- seguradora, número do documento, competência, vencimento e valor do boleto;
- titulares, CPF, ID funcional e total de cada família;
- mês correspondente na TS e valores de cada colaborador localizado.

Ao selecionar vários boletos, o valor total é somado e titulares repetidos têm
seus valores familiares acumulados antes do preenchimento da tabela.

O resumo informa quantas famílias foram vinculadas, quais não apareceram na TS
e se o total das famílias é diferente do valor total cobrado. Titulares que não
forem localizados na TS também são adicionados à lista com nome, ID e valor
preenchidos; como não possuem horas na TS, ficam sinalizados para revisão. O PDF
é lido localmente no navegador e não é enviado nem armazenado.

### Importar segurados/funcionários

Na etapa de segurados/funcionários, o app carrega automaticamente os
colaboradores encontrados na TS para o mês selecionado. Linhas sem valor não
participam do cálculo.

Opcionalmente, você pode preencher os valores em lote importando uma lista
`.xlsx` ou `.csv` com pelo menos as colunas:

| Coluna | Obrigatória | Sinônimos aceitos |
|--------|-------------|-------------------|
| Nome | sim | Nome Colaborador, Colaborador, Funcionário, Segurado |
| Valor | sim | Valor Segurado, Valor Funcionário, Valor Férias, Mensalidade |
| Id Colaborador | não | Id, Matrícula |

Quando o nome ou ID existir na TS do mês selecionado, o app associa
automaticamente ao colaborador correto.

Também é possível usar **Colar valores** com duas colunas copiadas do Excel:
nome ou ID do colaborador na primeira coluna e valor na segunda. Os filtros
**Todos**, **Com valor** e **Sem valor** ajudam a revisar listas grandes.

### Rodar localmente (opcional / offline)

Duplo clique em **`Abrir_Local.bat`** (serve a pasta `docs/` em
`http://127.0.0.1:5500`). Requer Python instalado.

## Arquitetura

| Camada | Arquivo | Responsabilidade |
|--------|---------|------------------|
| **Núcleo (domínio)** | `docs/core.js` | Leitura da TS, validação, cálculo e montagem do `.xlsx`. Sem DOM — 100% testável. |
| **Interface** | `docs/app.js`, `docs/index.html`, `docs/styles.css` | Eventos, formulário e exibição. Consome `RateioCore`. |
| **Leitor de PDF** | `docs/pdf-reader.js`, `docs/vendor/pdf*.js` | Extração local do texto do boleto com PDF.js. |
| **Biblioteca** | `docs/vendor/xlsx.full.min.js` | SheetJS (leitura/escrita de Excel), vendorizado com SRI. |
| **Testes** | `tests/core.test.js` | Suíte `node:test` sobre o núcleo. |

`core.js` é um módulo UMD: no navegador expõe `window.RateioCore`; no Node é
importável (`require`), o que permite testar a lógica fora do browser.

## Testes

```bash
npm test        # node --test sobre tests/
```

Cobrem utilitários (norm/mesKey/toFloat), leitura da TS, validação de entrada,
invariantes do cálculo (soma das proporções = 1, VALOR FINAL = valor do boleto,
ajuste de centavos) e o round-trip de geração/releitura do `.xlsx`.

## Planilha TS esperada

O app procura, em qualquer aba do arquivo, um cabeçalho com as colunas:

| Coluna            | Obrigatória |
|-------------------|-------------|
| Id Colaborador    | não         |
| Nome Colaborador  | sim         |
| Mês               | sim         |
| GP                | sim         |
| Horas Trabalhadas | sim         |
| Proporção de Hora | sim         |

(No arquivo de exemplo é a aba `fHorasTrabalhadas`.)

## Lógica do rateio (Plano de Saúde)

1. Linhas da TS dos segurados informados, no mês do boleto.
2. Por linha: `valor da linha = valor do segurado × Proporção de Hora`.
3. **VALOR (por GP)** = soma dos valores das linhas por GP.
4. **Proporção (por GP)** = `VALOR_gp ÷ soma de todos os VALOR` (= soma dos segurados).
5. **VALOR FINAL (por GP)** = `valor do boleto × Proporção_gp`.
   A soma do VALOR FINAL sempre fecha no valor do boleto (diferença de centavos
   ajustada no maior GP).

A planilha exportada traz a aba **Rateio** (tabela final) e a aba
**Detalhe_Segurados** (auditoria: cada segurado × GP).

## Segurança

- **Processamento local:** a planilha e o boleto PDF são lidos e o resultado é
  gerado dentro do navegador. Nada é enviado a servidores (`connect-src 'none'`
  no CSP).
- **CSP rígido** + **SRI** no SheetJS (impede adulteração da biblioteca).
- **HTTPS** automático no GitHub Pages.
- **Sem dados no repositório:** `.gitignore` bloqueia planilhas, CSVs e PDFs.

> Por ser um site público e estático, não há login. Como o app não armazena nem
> transmite dados, o risco se limita ao uso da calculadora por terceiros.
