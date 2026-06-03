# Rateio por GP

Aplicativo para calcular o **rateio de custos por GP (Centro de Custo)**, rodando
**100% no navegador** (sem servidor). No momento está implementado o rateio de
**Plano de Saúde**; a estrutura já está preparada para **Férias, Rescisão e 13º**.

**App online:** https://marlonpasseri.github.io/APP-Rateio/

## Como usar

1. Abra a URL acima (ou rode localmente — veja abaixo).
2. Na tela:
   1. **Tipo de rateio** → Plano de Saúde.
   2. **Importar a planilha TS** (.xlsx) — reimportada por completo todo mês.
   3. **Dados do boleto** → seguradora, código, mês e valor.
   4. **Segurados** → selecione cada segurado e o valor (já com dependentes).
   5. **Calcular** → confira a tabela e clique em **Baixar planilha**.

O arquivo baixado segue o padrão `AA-MM-Seguradora-codigo_boleto.xlsx`
(ex.: `25-01-Bradesco-BoletoX123.xlsx`).

### Rodar localmente (opcional / offline)

Duplo clique em **`Abrir_Local.bat`** (serve a pasta `docs/` em
`http://127.0.0.1:5500`). Requer Python instalado.

## Arquitetura

| Camada | Arquivo | Responsabilidade |
|--------|---------|------------------|
| **Núcleo (domínio)** | `docs/core.js` | Leitura da TS, validação, cálculo e montagem do `.xlsx`. Sem DOM — 100% testável. |
| **Interface** | `docs/app.js`, `docs/index.html`, `docs/styles.css` | Eventos, formulário e exibição. Consome `RateioCore`. |
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

- **Processamento local:** a planilha é lida e o resultado é gerado dentro do
  navegador. Nada é enviado a servidores (`connect-src 'none'` no CSP).
- **CSP rígido** + **SRI** no SheetJS (impede adulteração da biblioteca).
- **HTTPS** automático no GitHub Pages.
- **Sem dados no repositório:** `.gitignore` bloqueia `*.xlsx/.xlsm/.csv`.

> Por ser um site público e estático, não há login. Como o app não armazena nem
> transmite dados, o risco se limita ao uso da calculadora por terceiros.
