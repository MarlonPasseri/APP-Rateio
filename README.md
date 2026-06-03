# APP de Rateio por GP

Aplicativo para calcular o **rateio de custos por GP (Centro de Custo)**.
No momento está implementado o rateio de **Plano de Saúde**. A estrutura já está
preparada para receber **Férias, Rescisão e 13º** (selecionáveis na tela).

Há **duas versões equivalentes** do app:

| Versão | Onde fica | Como roda |
|--------|-----------|-----------|
| **Navegador (GitHub Pages)** | `docs/` | 100% no navegador, sem servidor. Publicada no GitHub Pages. |
| **Local (Flask)** | `app.py`, `rateio.py`, `templates/` | Servidor Python local, via `Iniciar_APP.bat`. |

Ambas usam a **mesma lógica de cálculo** e geram a mesma planilha de saída.

## Versão online (GitHub Pages)

A pasta `docs/` é um site estático servido pelo GitHub Pages
(`Settings → Pages → Source: branch main, pasta /docs`).

### Segurança

- **Processamento local:** a planilha é lida e o resultado é gerado **dentro do
  navegador** (biblioteca SheetJS). Nenhum dado é enviado para servidor algum
  (`connect-src 'none'` no CSP).
- **HTTPS:** automático no GitHub Pages.
- **CSP rígido:** `Content-Security-Policy` restringe scripts a `'self'`,
  estilos/fontes apenas ao Google Fonts, e bloqueia `connect`, `frame`, `base` e `form-action`.
- **SRI:** o SheetJS é vendorizado em `docs/vendor/` e carregado com
  `integrity` (Subresource Integrity), impedindo adulteração do arquivo.
- **Sem dados no repositório:** `.gitignore` bloqueia `*.xlsx/.xlsm/.csv` e as
  pastas `uploads/` e `saidas/`.

> Observação: por ser um site **público e estático**, não há login real.
> Como o app não armazena nem transmite dados, o risco se limita ao uso da
> calculadora por terceiros.

## Como usar

1. Dê duplo clique em **`Iniciar_APP.bat`** (instala as dependências na 1ª vez e
   abre o navegador em `http://127.0.0.1:5000`).
   - Alternativa manual: `pip install -r requirements.txt` e depois `python app.py`.
2. Na tela:
   1. **Tipo de rateio** → Plano de Saúde.
   2. **Importar a planilha TS** (.xlsx) — reimportada por completo todo mês.
   3. **Dados do boleto** → seguradora, código, mês e valor.
   4. **Segurados** → selecione cada segurado e o valor (já com dependentes).
   5. **Calcular** → confira a tabela e clique em **Baixar planilha**.

O arquivo é salvo na pasta `saidas/` com o nome
`AA-MM-Seguradora-codigo_boleto.xlsx` (ex.: `25-01-Bradesco-BoletoX123.xlsx`).

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

1. **Tabela temporária** com as linhas da TS dos segurados informados, no mês do boleto.
2. Por linha: `valor da linha = valor do segurado × Proporção de Hora`.
3. **VALOR (por GP)** = soma (`SOMASES`) dos valores das linhas por GP.
4. **Proporção (por GP)** = `VALOR_gp ÷ soma de todos os VALOR` (= soma dos segurados).
5. **VALOR FINAL (por GP)** = `valor do boleto × Proporção_gp`.
   A soma do VALOR FINAL sempre fecha exatamente no valor do boleto
   (eventual diferença de centavos é ajustada no maior GP).

A planilha exportada traz a aba **Rateio** (tabela final) e a aba
**Detalhe_Segurados** (auditoria: cada segurado × GP).

## Arquivos

| Arquivo            | Descrição                                  |
|--------------------|--------------------------------------------|
| `app.py`           | Servidor web (Flask).                      |
| `rateio.py`        | Núcleo de cálculo e exportação.            |
| `templates/`       | Interface (HTML/CSS/JS).                    |
| `saidas/`          | Planilhas geradas.                         |
| `_teste_calculo.py`| Teste rápido do cálculo com a base exemplo.|
