"use strict";
/* Testes do núcleo (docs/core.js). Executar com: npm test  (node --test tests/) */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../docs/core.js");
const XLSX = C.XLSX;

const HEADER = ["Id Colaborador", "Nome Colaborador", "Mês", "Horas Mês", "GP", "Horas Trabalhadas", "Proporção de Hora"];

/** Monta um workbook TS sintético a partir de linhas [id,nome,mes(Date),horasMes,gp,horas,prop]. */
function tsWorkbook(rows, header = HEADER, aba = "fHorasTrabalhadas") {
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, aba);
  return wb;
}

const JAN = new Date(2025, 0, 1);
const FEV = new Date(2025, 1, 1);

test("integridade SRI do SheetJS corresponde ao arquivo publicado", () => {
  const html = fs.readFileSync(path.join(__dirname, "../docs/index.html"), "utf8");
  const match = html.match(/xlsx\.full\.min\.js"[\s\S]*?integrity="(sha384-[^"]+)"/);
  assert.ok(match, "integrity SHA-384 do SheetJS não encontrado no HTML");

  const vendor = fs.readFileSync(path.join(__dirname, "../docs/vendor/xlsx.full.min.js"));
  const sri = `sha384-${crypto.createHash("sha384").update(vendor).digest("base64")}`;
  assert.equal(match[1], sri);
});

// cenário-base reutilizado
function cenarioBase() {
  const wb = tsWorkbook([
    ["COL001", "Ana Lima", JAN, 168, 2718, 168, 0.5],
    ["COL001", "Ana Lima", JAN, 168, 2913, 168, 0.5],
    ["COL002", "Bruno Sá", JAN, 176, 2339, 176, 1.0],
    ["COL003", "Carla Reis", JAN, 160, 2718, 80, 0.5],
    ["COL003", "Carla Reis", JAN, 160, 2913, 80, 0.5],
    ["COL004", "Davi Nunes", FEV, 168, 9000, 168, 1.0],
  ]);
  return C.carregarTS(wb);
}

// ---------------------------------------------------------------- utilitários
test("norm remove acentos, baixa caixa e colapsa espaços", () => {
  assert.equal(C.norm("  Proporção  DE   Hora "), "proporcao de hora");
  assert.equal(C.norm("ÁÉÍ Çção"), "aei ccao");
  assert.equal(C.norm(null), "");
});

test("mesKey aceita Date, AAAA-MM e MM/AAAA", () => {
  assert.equal(C.mesKey(new Date(2025, 0, 1)), "2025-01");
  assert.equal(C.mesKey("2025-03"), "2025-03");
  assert.equal(C.mesKey("03/2025"), "2025-03");
  assert.equal(C.mesKey("texto"), null);
  assert.equal(C.mesKey(null), null);
});

test("toFloat entende formato brasileiro e R$", () => {
  assert.equal(C.toFloat("1.234,56"), 1234.56);
  assert.equal(C.toFloat("R$ 1.000,00"), 1000);
  assert.equal(C.toFloat("450,5"), 450.5);
  assert.equal(C.toFloat(1234.56), 1234.56);
  assert.equal(C.toFloat(""), 0);
  assert.equal(C.toFloat("abc"), 0);
});

test("nomeArquivoSaida segue o padrão AA-MM-Seguradora-codigo e sanitiza", () => {
  assert.equal(C.nomeArquivoSaida("2025-01", "Bradesco", "BoletoX123"), "25-01-Bradesco-BoletoX123.xlsx");
  assert.equal(C.nomeArquivoSaida("2025-12", "Seg/A", "B:1*"), "25-12-Seg_A-B_1_.xlsx");
});

// ---------------------------------------------------------------- carregarTS
test("carregarTS reconhece a aba e extrai meses/linhas", () => {
  const ts = cenarioBase();
  assert.equal(ts.aba, "fHorasTrabalhadas");
  assert.deepEqual(ts.meses, ["2025-01", "2025-02"]);
  assert.equal(ts.linhas.length, 6);
});

test("carregarTS lança erro quando faltam colunas obrigatórias", () => {
  const wb = tsWorkbook([["x", "y"]], ["Coluna A", "Coluna B"]);
  assert.throws(() => C.carregarTS(wb), /planilha TS/);
});

test("carregarTS rejeita objeto que não é planilha", () => {
  assert.throws(() => C.carregarTS({}), /inválido|planilha/i);
});

// ---------------------------------------------------------------- carregarPessoas
test("carregarPessoas importa nome, id opcional e valor de workbook", () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Id Colaborador", "Nome", "Valor"],
    ["COL001", "Ana Lima", "1.234,56"],
    ["", "Bruno Sa", 450.5],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Segurados");
  const imp = C.carregarPessoas(wb);

  assert.equal(imp.aba, "Segurados");
  assert.deepEqual(imp.pessoas, [
    { id: "COL001", nome: "Ana Lima", valor: 1234.56 },
    { id: "", nome: "Bruno Sa", valor: 450.5 },
  ]);
});

test("carregarPessoas aceita CSV com sinonimo de coluna de valor", () => {
  const wb = XLSX.read("Colaborador;Mensalidade\nAna Lima;123,45\n", { type: "string", raw: true });
  const imp = C.carregarPessoas(wb);
  assert.deepEqual(imp.pessoas, [{ id: "", nome: "Ana Lima", valor: 123.45 }]);
});

test("carregarPessoas exige colunas de nome e valor", () => {
  const ws = XLSX.utils.aoa_to_sheet([["Nome"], ["Ana"]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Invalida");
  assert.throws(() => C.carregarPessoas(wb), /Nome e Valor/);
});

test("parsePessoasColadas lê nome ou ID e valor copiados do Excel", () => {
  assert.deepEqual(
    C.parsePessoasColadas("Colaborador\tValor\nCOL001\t1.234,56\nBruno Sá\t450,50\n"),
    [
      { chave: "COL001", valor: 1234.56 },
      { chave: "Bruno Sá", valor: 450.5 },
    ]
  );
});

test("parsePessoasColadas aceita ponto e vírgula e ignora linhas inválidas", () => {
  assert.deepEqual(
    C.parsePessoasColadas("Ana Lima;100,00\nlinha sem separador\n;200"),
    [{ chave: "Ana Lima", valor: 100 }]
  );
  assert.deepEqual(C.parsePessoasColadas(null), []);
});

// ---------------------------------------------------------------- boleto PDF
const TEXTO_BOLETO_SULAMERICA = `
Fatura Mensal
Competencia: 20/12/2024 A 19/01/2025
Pagador: Número do Documento Vencimento
8TMBW - GEOPROJETOS ENGENHARIA LTDA 75777255521450 06/01/2025
VALOR TOTAL: 19.485,74
SUL AMERICA COMPANHIA DE SEGURO SAUDE
Razão Social: GEOPROJETOS ENGENHARIA LTDA
Empresa: 8-TMBW Período de Competência: 20/12/2024 a 19/01/2025
88888487744420012 65880-EXATO CARLOS SILVA SANTOS 130.012.546-29 000546290 12/05/1995 29 TITULAR 02/12/2024 R$ 566,51
Total da Familia: R$ 566,51
88888478858620011 65883-ESPECIAL 100 DANIEL LOPES DE OLIVEIRA 102.661.717-02 478858620 03/03/1984 40 TITULAR 20/10/2022 R$ 703,16
88888478858620100 65883-ESPECIAL 100 SARAH OLIVEIRA LOPES 151.660.257-92 478858620 06/10/2006 18 FILHO(A) 20/10/2022 R$ 329,27
Total da Família: R$ 1.032,43
Total Geral: R$ 1.598,94
Total de Segurados: 3
`;

test("parseBoletoSulAmerica extrai dados gerais e total por família", () => {
  const boleto = C.parseBoletoSulAmerica(TEXTO_BOLETO_SULAMERICA);
  assert.equal(boleto.seguradora, "SulAmérica");
  assert.equal(boleto.codigo_boleto, "75777255521450");
  assert.equal(boleto.contrato, "8-TMBW");
  assert.equal(boleto.empresa, "GEOPROJETOS ENGENHARIA LTDA");
  assert.equal(boleto.mes, "2025-01");
  assert.equal(boleto.valor_boleto, 19485.74);
  assert.equal(boleto.qtd_segurados, 3);
  assert.deepEqual(boleto.pessoas, [
    { id: "000546290", nome: "CARLOS SILVA SANTOS", cpf: "130.012.546-29", valor: 566.51 },
    { id: "478858620", nome: "DANIEL LOPES DE OLIVEIRA", cpf: "102.661.717-02", valor: 1032.43 },
  ]);
  assert.equal(boleto.total_familias, 1598.94);
});

test("parseBoletoSulAmerica aceita boleto bancário com Valor Cobrado", () => {
  const texto = TEXTO_BOLETO_SULAMERICA.replace(
    "VALOR TOTAL: 19.485,74",
    "(=) Valor Cobrado\n19.485,74"
  );
  const boleto = C.parseBoletoSulAmerica(texto);

  assert.equal(boleto.valor_boleto, 19485.74);
  assert.equal(boleto.pessoas.length, 2);
  assert.equal(boleto.total_familias, 1598.94);
});

const TEXTO_BOLETO_BRADESCO = `
SPG/Grupos Especiais BRADESCO SAUDE - FATURA TECNICA
Cia Suc Apol.(s) Cob Fatura M/A nr Estipulante EMPRESA EXEMPLO LTDA Ramo Data Emissao Pag.
571 605 0690060 MEDICA 01/2025 01 Subfatura 0001 - EMPRESA EXEMPLO LTDA 876 - MULTI SAUDE EMPRESA 16/12/2024 1
(TS)TOTAIS DA SUBFATURA 2 3 5 5 5.000,00 0,00
Seguradora CNPJ Proposta Prest. Cont. Vencimento
BRADESCO SAUDE S/A 092.693.118/0001-60 020456 01/01 17-03 16/01/2025
Data Emissao No Apolice End./Fatura Informacoes Complementares
16/12/2024 6050690060 605054269 SF0001
Inicio de Vigencia Nome do Segurado
DE 16.01.2025 A 15.02.2025 EMPRESA EXEMPLO LTDA
Moeda Premio Total Nome do Corretor
R$ ********5.120,00 CORRETORA EXEMPLO
0000100/00 ANA TESTE ALVES 01/05/1980 FEM CAS TNQQ 16/03/2020 01/2025 1.000,00 0,00
0000100/01 DEPENDENTE UM ALVES 14/10/1981 MAS CAS CONJ TNQQ 16/03/2020 01/2025 800,00 0,00
0000100/02 DEPENDENTE DOIS ALVES 13/06/2010 FEM SOLT FILH TNQQ 16/03/2020 01/2025 400,00 0,00
571 605 0690060 MEDICA 01/2025 01 Subfatura 0002 - FILIAL EXEMPLO 876 - MULTI SAUDE EMPRESA 16/12/2024 2
0000200/00 BRUNO EXEMPLO COSTA 22/05/1975 MAS CAS TNQQ 16/03/2020 01/2025 1.500,00 0,00
0000200/01 DEPENDENTE EXEMPLO COSTA 22/05/1976 FEM CAS CONJ TNQQ 16/03/2020 01/2025 1.300,00 0,00
`;

test("parseBoletoBradesco agrupa dependentes por certificado e extrai o boleto", () => {
  const boleto = C.parseBoletoBradesco(TEXTO_BOLETO_BRADESCO);
  assert.equal(boleto.seguradora, "Bradesco Saúde");
  assert.equal(boleto.codigo_boleto, "605054269");
  assert.equal(boleto.contrato, "6050690060");
  assert.equal(boleto.empresa, "EMPRESA EXEMPLO LTDA");
  assert.equal(boleto.mes, "2025-01");
  assert.equal(boleto.vencimento, "16/01/2025");
  assert.equal(boleto.valor_boleto, 5120);
  assert.equal(boleto.qtd_segurados, 5);
  assert.deepEqual(boleto.pessoas, [
    { id: "CERT-0000100", nome: "ANA TESTE ALVES", cpf: "", valor: 2200 },
    { id: "CERT-0000200", nome: "BRUNO EXEMPLO COSTA", cpf: "", valor: 2800 },
  ]);
  assert.equal(boleto.total_familias, 5000);
});

test("parseBoletoPdfText reconhece automaticamente fatura técnica Bradesco", () => {
  const boleto = C.parseBoletoPdfText(TEXTO_BOLETO_BRADESCO);
  assert.equal(boleto.seguradora, "Bradesco Saúde");
  assert.equal(boleto.pessoas.length, 2);
});

test("parseBoletoPdfText rejeita layouts ainda não suportados", () => {
  assert.throws(() => C.parseBoletoPdfText("boleto desconhecido"), /não reconheço/i);
});

test("combinarBoletos soma documentos e acumula titulares repetidos", () => {
  const primeiro = C.parseBoletoSulAmerica(TEXTO_BOLETO_SULAMERICA);
  const segundo = {
    ...primeiro,
    codigo_boleto: "DOC2",
    valor_boleto: 100,
    total_familias: 110,
    total_geral_relatorio: 110,
    qtd_segurados: 2,
    pessoas: [
      { id: "546290", nome: "CARLOS SILVA SANTOS", cpf: "130.012.546-29", valor: 10 },
      { id: "000999", nome: "ERIKA TESTE", cpf: "100.200.300-40", valor: 100 },
    ],
  };

  const combinado = C.combinarBoletos([primeiro, segundo]);
  assert.equal(combinado.quantidade_boletos, 2);
  assert.equal(combinado.mes, "2025-01");
  assert.equal(combinado.codigo_boleto, "75777255521450 + DOC2");
  assert.equal(combinado.valor_boleto, 19585.74);
  assert.equal(combinado.total_familias, 1708.94);
  assert.equal(combinado.pessoas.length, 3);
  assert.equal(combinado.pessoas.find((p) => p.nome === "CARLOS SILVA SANTOS").valor, 576.51);
});

test("combinarBoletos rejeita competências diferentes", () => {
  const boleto = C.parseBoletoSulAmerica(TEXTO_BOLETO_SULAMERICA);
  assert.throws(
    () => C.combinarBoletos([boleto, { ...boleto, mes: "2025-02" }]),
    /mesma competência/i
  );
});

// ---------------------------------------------------------------- colaboradores
test("colaboradores retorna distintos do mês, ordenados", () => {
  const ts = cenarioBase();
  const jan = C.colaboradores(ts, "2025-01").map((c) => c.nome);
  assert.deepEqual(jan, ["Ana Lima", "Bruno Sá", "Carla Reis"]);
  assert.deepEqual(C.colaboradores(ts, "2025-02").map((c) => c.nome), ["Davi Nunes"]);
});

test("encontrarColaborador aceita ID sem zeros à esquerda e nome exato", () => {
  const lista = [
    { id: "123", nome: "Ana Lima" },
    { id: "COL002", nome: "Bruno Sá" },
  ];
  assert.equal(C.encontrarColaborador(lista, { id: "000123", nome: "Outro" }), lista[0]);
  assert.equal(C.encontrarColaborador(lista, { nome: "BRUNO SA" }), lista[1]);
});

test("encontrarColaborador associa nome completo a abreviação única", () => {
  const lista = [
    { id: "COL001", nome: "Armando Neto" },
    { id: "COL002", nome: "Marlon Filho" },
    { id: "COL003", nome: "Marlon Mello" },
  ];
  assert.equal(
    C.encontrarColaborador(lista, { nome: "ARMANDO JOSE DA SILVA NETO" }),
    lista[0]
  );
  assert.equal(
    C.encontrarColaborador(lista, { nome: "MARLON PASSERI MELLO" }),
    lista[2]
  );
});

test("encontrarColaborador não escolhe associação abreviada ambígua", () => {
  const lista = [
    { id: "COL001", nome: "Maria Silva" },
    { id: "COL002", nome: "Maria Silva Souza" },
  ];
  assert.equal(
    C.encontrarColaborador(lista, { nome: "MARIA APARECIDA SILVA SOUZA" }),
    null
  );
  assert.equal(C.encontrarColaborador(lista, { nome: "Maria" }), null);
});

// ---------------------------------------------------------------- validarEntrada
test("validarEntrada aprova entrada correta", () => {
  const v = C.validarEntrada({
    mes: "2025-01", seguradora: "Bradesco", codigo_boleto: "B1", valor_boleto: 100,
    segurados: [{ id: "COL001", nome: "Ana", valor: 100 }],
  });
  assert.equal(v.ok, true);
  assert.equal(v.erros.length, 0);
});

test("validarEntrada acumula erros de campos obrigatórios", () => {
  const v = C.validarEntrada({ mes: "", seguradora: "", codigo_boleto: "", valor_boleto: 0, segurados: [] });
  assert.equal(v.ok, false);
  assert.ok(v.erros.length >= 4);
});

test("validarEntrada detecta valor negativo, duplicados e soma zero", () => {
  const dup = C.validarEntrada({
    mes: "2025-01", seguradora: "S", codigo_boleto: "C", valor_boleto: 10,
    segurados: [{ id: "1", nome: "Ana", valor: 5 }, { id: "1", nome: "Ana", valor: 5 }],
  });
  assert.match(dup.erros.join(" "), /repetido/i);

  const neg = C.validarEntrada({
    mes: "2025-01", seguradora: "S", codigo_boleto: "C", valor_boleto: 10,
    segurados: [{ id: "1", nome: "Ana", valor: -5 }],
  });
  assert.match(neg.erros.join(" "), /negativo/i);

  const zero = C.validarEntrada({
    mes: "2025-01", seguradora: "S", codigo_boleto: "C", valor_boleto: 10,
    segurados: [{ id: "1", nome: "Ana", valor: 0 }],
  });
  assert.match(zero.erros.join(" "), /valor de pelo menos/i);
});

// ---------------------------------------------------------------- calcularPlanoSaude
test("calcularPlanoSaude: invariantes de fechamento", () => {
  const ts = cenarioBase();
  const segurados = [
    { id: "COL001", nome: "Ana Lima", valor: 800 },
    { id: "COL002", nome: "Bruno Sá", valor: 1200.5 },
    { id: "COL003", nome: "Carla Reis", valor: 450 },
  ];
  const res = C.calcularPlanoSaude(ts, "2025-01", segurados, 2500);

  // total rateado == soma dos segurados
  assert.equal(res.total_valor_rateado, 2450.5);
  assert.equal(res.total_segurados, 2450.5);

  // soma das proporções == 1
  const somaProp = res.tabela_final.reduce((a, r) => a + r.proporcao, 0);
  assert.ok(Math.abs(somaProp - 1) < 1e-9, `somaProp=${somaProp}`);

  // soma do VALOR FINAL == valor do boleto (exato, após ajuste de centavos)
  const somaFinal = res.tabela_final.reduce((a, r) => a + r.valor_final, 0);
  assert.equal(C.round(somaFinal, 2), 2500);

  // VALOR por GP
  const porGp = Object.fromEntries(res.tabela_final.map((r) => [r.gp, r.valor]));
  assert.equal(porGp[2339], 1200.5);
  assert.equal(porGp[2718], 625);
  assert.equal(porGp[2913], 625);

  assert.deepEqual(res.segurados_sem_horas, []);
  assert.equal(res.qtd_gps, 3);
});

test("calcularPlanoSaude: ajuste de centavos cobre arredondamento", () => {
  // três GPs iguais com boleto que não divide exatamente
  const ts = C.carregarTS(tsWorkbook([
    ["A", "AA", JAN, 90, 1, 30, 1 / 3],
    ["A", "AA", JAN, 90, 2, 30, 1 / 3],
    ["A", "AA", JAN, 90, 3, 30, 1 / 3],
  ]));
  const res = C.calcularPlanoSaude(ts, "2025-01", [{ id: "A", nome: "AA", valor: 100 }], 100);
  const somaFinal = res.tabela_final.reduce((a, r) => a + r.valor_final, 0);
  assert.equal(C.round(somaFinal, 2), 100); // fecha mesmo com 33,33 x3
});

test("calcularPlanoSaude: segurado sem horas é sinalizado", () => {
  const ts = cenarioBase();
  const res = C.calcularPlanoSaude(ts, "2025-01",
    [{ id: "COL999", nome: "Fantasma", valor: 100 }], 100);
  assert.deepEqual(res.segurados_sem_horas, ["Fantasma"]);
  assert.deepEqual(res.itens_sem_horas, [
    { id: "COL999", nome: "Fantasma", valor: 100 },
  ]);
  assert.equal(res.tabela_final.length, 0);
});

test("calcularPlanoSaude: casa por nome quando id não bate", () => {
  const ts = cenarioBase();
  const res = C.calcularPlanoSaude(ts, "2025-01",
    [{ id: "", nome: "Bruno Sá", valor: 300 }], 300);
  assert.equal(res.qtd_gps, 1);
  assert.equal(res.tabela_final[0].gp, 2339);
  assert.equal(res.tabela_final[0].valor_final, 300);
});

test("calcularPlanoSaude: sinaliza proporção que não soma 1 no mês", () => {
  // proporções somam 0,9 para a pessoa -> erro de dado na TS
  const ts = C.carregarTS(tsWorkbook([
    ["X1", "Erro Dado", JAN, 168, 100, 80, 0.4],
    ["X1", "Erro Dado", JAN, 168, 200, 100, 0.5],
  ]));
  const res = C.calcularPlanoSaude(ts, "2025-01", [{ id: "X1", nome: "Erro Dado", valor: 500 }], 500);
  assert.equal(res.segurados_proporcao_suspeita.length, 1);
  assert.equal(res.segurados_proporcao_suspeita[0].nome, "Erro Dado");
  assert.equal(res.segurados_proporcao_suspeita[0].soma, 0.9);
  // mesmo com dado torto, o VALOR FINAL ainda fecha no boleto
  assert.equal(C.round(res.tabela_final.reduce((a, r) => a + r.valor_final, 0), 2), 500);
});

test("calcularPlanoSaude: proporção correta não gera aviso", () => {
  const ts = cenarioBase();
  const res = C.calcularPlanoSaude(ts, "2025-01",
    [{ id: "COL001", nome: "Ana Lima", valor: 800 }], 800);
  assert.deepEqual(res.segurados_proporcao_suspeita, []);
});

// ---------------------------------------------------------------- montarWorkbook (round-trip)
test("montarWorkbook gera abas e valores que sobrevivem à releitura", () => {
  const ts = cenarioBase();
  const segurados = [
    { id: "COL001", nome: "Ana Lima", valor: 800 },
    { id: "COL002", nome: "Bruno Sá", valor: 1200.5 },
    { id: "COL003", nome: "Carla Reis", valor: 450 },
  ];
  const res = C.calcularPlanoSaude(ts, "2025-01", segurados, 2500);
  const meta = C.prepararExport(res, { seguradora: "Bradesco", codigo_boleto: "B1" });
  const wb = C.montarWorkbook(res, meta);

  // escreve em buffer e relê (round-trip)
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const lido = XLSX.read(buf, { type: "buffer" });

  assert.deepEqual(lido.SheetNames, ["Rateio", "Detalhe_Segurados"]);

  const aoa = XLSX.utils.sheet_to_json(lido.Sheets["Rateio"], { header: 1, raw: true, blankrows: false });
  // metadados
  assert.equal(aoa[1][0], "Seguradora");
  assert.equal(aoa[1][1], "Bradesco");
  assert.equal(aoa[4][0], "Valor do boleto");
  assert.equal(aoa[4][1], 2500);
  // linha TOTAL: VALOR FINAL deve fechar em 2500
  const total = aoa[aoa.length - 1];
  assert.equal(total[0], "TOTAL");
  assert.equal(C.round(total[4], 2), 2500);

  // aba de auditoria: cabeçalho + 5 linhas de detalhe (jan)
  const det = XLSX.utils.sheet_to_json(lido.Sheets["Detalhe_Segurados"], { header: 1, raw: true, blankrows: false });
  assert.equal(det.length, 1 + 5);
  assert.equal(det[0][7], "Status");
  det.slice(1).forEach((linha) => assert.equal(linha[7], "Rateado"));
});

test("montarWorkbook inclui segurado sem horas na planilha de detalhes", () => {
  const ts = cenarioBase();
  const segurados = [
    { id: "COL002", nome: "Bruno Sá", valor: 600 },
    { id: "CERT-999", nome: "Não Encontrado", valor: 150 },
  ];
  const res = C.calcularPlanoSaude(ts, "2025-01", segurados, 750);
  const meta = C.prepararExport(res, {
    seguradora: "Bradesco Saúde",
    codigo_boleto: "B2",
  });
  const wb = C.montarWorkbook(res, meta);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const lido = XLSX.read(buf, { type: "buffer" });
  const detalhe = XLSX.utils.sheet_to_json(
    lido.Sheets["Detalhe_Segurados"],
    { header: 1, raw: true, blankrows: false }
  );

  const naoEncontrado = detalhe.find((linha) => linha[1] === "Não Encontrado");
  assert.ok(naoEncontrado);
  assert.deepEqual(naoEncontrado, [
    "CERT-999", "Não Encontrado", "", 0, 0, 150, 0, "Sem horas na TS",
  ]);
  assert.deepEqual(res.sem_horas, ["Não Encontrado"]);
  assert.equal(res.qtd_gps, 1);
  assert.equal(
    C.round(res.tabela_final.reduce((soma, linha) => soma + linha.valor_final, 0), 2),
    750
  );
});

test("montarWorkbook permite exportar quando nenhum segurado tem horas", () => {
  const ts = cenarioBase();
  const res = C.calcularPlanoSaude(ts, "2025-01", [
    { id: "CERT-001", nome: "Pessoa Um", valor: 100 },
    { id: "CERT-002", nome: "Pessoa Dois", valor: 200 },
  ], 300);
  const meta = C.prepararExport(res, {
    seguradora: "Exemplo",
    codigo_boleto: "SEM-HORAS",
  });
  const wb = C.montarWorkbook(res, meta);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const lido = XLSX.read(buf, { type: "buffer" });
  const rateio = XLSX.utils.sheet_to_json(
    lido.Sheets.Rateio,
    { header: 1, raw: true, blankrows: false }
  );
  const detalhe = XLSX.utils.sheet_to_json(
    lido.Sheets.Detalhe_Segurados,
    { header: 1, raw: true, blankrows: false }
  );

  assert.equal(res.tabela_final.length, 0);
  assert.deepEqual(res.sem_horas, ["Pessoa Um", "Pessoa Dois"]);
  assert.equal(rateio[rateio.length - 1][0], "TOTAL");
  assert.equal(rateio[rateio.length - 1][4], 0);
  assert.equal(detalhe.length, 3);
  assert.deepEqual(
    detalhe.slice(1).map((linha) => [linha[1], linha[5], linha[7]]),
    [
      ["Pessoa Um", 100, "Sem horas na TS"],
      ["Pessoa Dois", 200, "Sem horas na TS"],
    ]
  );
});

// ---------------------------------------------------------------- Férias
test("validarFerias exige mês e funcionários", () => {
  assert.equal(C.validarFerias({ mes: "", funcionarios: [] }).ok, false);
  const ok = C.validarFerias({ mes: "2025-01", funcionarios: [{ id: "A", nome: "Ana", valor: 100 }] });
  assert.equal(ok.ok, true);
});

test("validarFerias detecta duplicados e soma zero", () => {
  const v = C.validarFerias({
    mes: "2025-01",
    funcionarios: [{ id: "1", nome: "Ana", valor: 0 }, { id: "1", nome: "Ana", valor: 0 }],
  });
  assert.match(v.erros.join(" "), /repetido/i);
  assert.match(v.erros.join(" "), /valor de pelo menos/i);
});

test("calcularFerias: VALOR FINAL = VALOR e soma fecha no total das férias", () => {
  const ts = cenarioBase();
  const func = [
    { id: "COL001", nome: "Ana Lima", valor: 1000 },   // 0,5/0,5 -> 500 em 2718 e 2913
    { id: "COL002", nome: "Bruno Sá", valor: 600 },     // 1,0 -> 600 em 2339
  ];
  const res = C.calcularFerias(ts, "2025-01", func);
  assert.equal(res.tipo, "ferias");
  assert.equal(res.total_ferias, 1600);
  assert.equal(res.total_valor_rateado, 1600);

  const porGp = Object.fromEntries(res.tabela_final.map((r) => [r.gp, r.valor_final]));
  assert.equal(porGp[2339], 600);
  assert.equal(porGp[2718], 500);
  assert.equal(porGp[2913], 500);

  // VALOR FINAL == VALOR em todas as linhas (sem reescala de boleto)
  res.tabela_final.forEach((r) => assert.equal(r.valor_final, r.valor));
  const somaFinal = res.tabela_final.reduce((a, r) => a + r.valor_final, 0);
  assert.equal(C.round(somaFinal, 2), 1600);
});

test("calcularFerias: sinaliza funcionário sem horas no mês", () => {
  const ts = cenarioBase();
  const res = C.calcularFerias(ts, "2025-01", [
    { id: "COL002", nome: "Bruno Sá", valor: 600 },
    { id: "COL999", nome: "Fantasma", valor: 100 },
  ]);
  assert.deepEqual(res.funcionarios_sem_horas, ["Fantasma"]);
  assert.deepEqual(res.itens_sem_horas, [
    { id: "COL999", nome: "Fantasma", valor: 100 },
  ]);
  assert.equal(res.qtd_gps, 1);
});

test("nomeArquivoFerias: 1 funcionário usa o nome; vários usam a contagem", () => {
  assert.equal(C.nomeArquivoFerias("2025-01", ["Ana Lima"]), "25-01-Ferias-Ana Lima.xlsx");
  assert.equal(C.nomeArquivoFerias("2025-03", ["Ana", "Bruno", "Ana"]), "25-03-Ferias-2-funcionarios.xlsx");
});

test("prepararExport monta metadados por tipo", () => {
  const ts = cenarioBase();
  const ferias = C.calcularFerias(ts, "2025-01", [{ id: "COL002", nome: "Bruno Sá", valor: 600 }]);
  const expF = C.prepararExport(ferias, {});
  assert.match(expF.titulo, /Férias/);
  assert.equal(expF.detalheAba, "Detalhe_Funcionarios");
  assert.match(expF.nomeArquivo, /Ferias-Bruno/);

  const plano = C.calcularPlanoSaude(ts, "2025-01", [{ id: "COL002", nome: "Bruno Sá", valor: 600 }], 600);
  const expP = C.prepararExport(plano, { seguradora: "Bradesco", codigo_boleto: "B1" });
  assert.match(expP.titulo, /Plano de Saúde/);
  assert.equal(expP.detalheAba, "Detalhe_Segurados");
});

// ---------------------------------------------------------------- alimentação
/** Pedido de recarga no formato das planilhas mensais (título, cabeçalho, linhas, TOTAL). */
function pedidoWorkbook() {
  const q1 = XLSX.utils.aoa_to_sheet([
    ["JANEIRO (01 A 15-01) 10 DIAS"],
    ["FUNCIONÁRIO", "VALOR", "DIAS", "VALE REFEIÇÃO", "VALE ALIMENTAÇÃO", "SALDO LIVRE", "OBSERVAÇÕES"],
    ["Ana Lima", 50, 10, 500, "x", null, null],
    ["Bruno Sá", 50, 10, "x", 500, null, "Trabalhou dia 15"],
    [null, null, null, null, null, null, "linha só com observação"],
    ["Carla Reis", 50, 10, 250, 125, 125, null],
    [null, null, null, 750, 625, 125],
    ["TOTAL (VR + VA)", null, null, 1500],
  ]);
  const avulsos = XLSX.utils.aoa_to_sheet([
    ["EMISSÃO DE CARTÃO"],
    ["FUNCIONÁRIO", "VALOR", "VALE REFEIÇÃO"],
    ["Davi Nunes", 50, "EMISSÃO"],
    ["TOTAL"],
    [],
    ["JANEIRO (16 a 31/01)"],
    ["FUNCIONÁRIO", "VALOR", "DIAS", "VALE ALIMENTAÇÃO"],
    ["Ana Lima", 50, 2, 100],
    ["TOTAL (ALELO)", null, null, 100],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, avulsos, "Planilha2");
  XLSX.utils.book_append_sheet(wb, q1, "01 a 15-01");
  return wb;
}

test("lerPedidoAlimentacao lê blocos, trata 'x', soma saldo livre no VA e ignora blocos zerados", () => {
  const blocos = C.lerPedidoAlimentacao(pedidoWorkbook());
  assert.equal(blocos.length, 2);                       // bloco "EMISSÃO" (total 0) é ignorado
  const [av, q1] = blocos;
  assert.equal(av.aba, "Planilha2");
  assert.equal(av.titulo, "JANEIRO (16 a 31/01)");
  assert.equal(av.avulso, true);
  assert.equal(q1.titulo, "JANEIRO (01 A 15-01) 10 DIAS");
  assert.equal(q1.avulso, false);
  assert.deepEqual(q1.itens.map((i) => [i.nome, i.vr, i.va]), [
    ["Ana Lima", 500, 0], ["Bruno Sá", 0, 500], ["Carla Reis", 250, 250],
  ]);
  assert.equal(q1.itens[1].obs, "Trabalhou dia 15");
  assert.equal(q1.total_vr, 750);
  assert.equal(q1.total_va, 750);
  assert.equal(q1.total, 1500);
});

test("lerPedidoAlimentacao falha com mensagem clara sem tabela de pedido", () => {
  assert.throws(() => C.lerPedidoAlimentacao(tsWorkbook([])), /pedido/);
});

test("juntarPedido soma quem aparece em mais de uma quinzena", () => {
  const itens = C.juntarPedido(C.lerPedidoAlimentacao(pedidoWorkbook()));
  const ana = itens.find((i) => i.nome === "Ana Lima");
  assert.deepEqual([ana.vr, ana.va], [500, 100]);
  assert.equal(itens.length, 3);
});

test("casarNome: exato, provável, grafia aproximada e ambíguo", () => {
  const colabs = [
    { id: "1", nome: "Armando Neto" }, { id: "2", nome: "Marlon Mello" }, { id: "3", nome: "Marlon Filho" },
    { id: "4", nome: "Fernanda Brant" }, { id: "5", nome: "Fernanda Romano" }, { id: "6", nome: "Luan Dias" },
    { id: "7", nome: "Luana Ferreira" }, { id: "8", nome: "Mariana Xavier" }, { id: "9", nome: "Renato Pereira" },
    { id: "10", nome: "Renata Alves" },
  ];
  const r = (n) => C.casarNome(n, colabs);
  assert.equal(r("marlon  mello").colab.id, "2");
  assert.equal(r("marlon  mello").exato, true);
  assert.equal(r("Armando Jose").colab.id, "1");            // único com o primeiro nome
  assert.equal(r("Armando Jose").exato, false);
  assert.equal(r("Marlon Soares (FILHO)").colab.id, "3");   // mais tokens em comum
  assert.equal(r("Mariana de Oliveira Xavier").colab.id, "8");
  assert.equal(r("Fernanda Brandt").colab.id, "4");         // Brandt ~ Brant
  assert.equal(r("Luana Machado").colab.id, "7");           // não confunde com "Luan"
  assert.equal(r("Renata Souza").colab.id, "10");           // não confunde com "Renato"
  const amb = r("Marlon Passeri");
  assert.equal(amb.colab, null);
  assert.deepEqual(amb.candidatos.map((c) => c.id).sort(), ["2", "3"]);
  assert.equal(r("Zé Ninguém").colab, null);
});

test("validarAlimentacao exige mês, fornecedor e ao menos um valor", () => {
  const base = { mes: "2025-01", fornecedor: "iFood", funcionarios: [{ id: "A", nome: "Ana", vr: 100, va: 0 }] };
  assert.equal(C.validarAlimentacao(base).ok, true);
  assert.equal(C.validarAlimentacao({ ...base, fornecedor: " " }).ok, false);
  assert.equal(C.validarAlimentacao({ ...base, mes: "" }).ok, false);
  const zero = C.validarAlimentacao({ ...base, funcionarios: [{ id: "A", nome: "Ana", vr: 0, va: 0 }] });
  assert.equal(zero.ok, false);
  const neg = C.validarAlimentacao({ ...base, funcionarios: [{ id: "A", nome: "Ana", vr: -5, va: 10 }] });
  assert.ok(neg.erros.some((e) => /negativo/.test(e)));
});

test("calcularAlimentacao: VR + VA = VALOR FINAL por GP e totais fecham no pedido", () => {
  const ts = cenarioBase();
  const func = [
    { id: "COL001", nome: "Ana Lima", vr: 333.33, va: 100 },
    { id: "COL002", nome: "Bruno Sá", vr: 0, va: 500 },
    { id: "COL003", nome: "Carla Reis", vr: 250.01, va: 250 },
  ];
  const res = C.calcularAlimentacao(ts, "2025-01", func, 1433.34);
  assert.equal(res.tipo, "alimentacao");
  assert.equal(res.total_vr, 583.34);
  assert.equal(res.total_va, 850);
  assert.equal(res.total_alimentacao, 1433.34);
  assert.equal(res.diferenca_boleto, 0);
  const soma = (k) => C.round(res.tabela_final.reduce((a, r) => a + r[k], 0), 2);
  assert.equal(soma("valor_final"), 1433.34);
  assert.equal(soma("vr"), 583.34);
  assert.equal(soma("va"), 850);
  for (const r of res.tabela_final) assert.equal(C.round(r.vr + r.va, 2), r.valor_final);
  const gp2339 = res.tabela_final.find((r) => r.gp === 2339);
  assert.deepEqual([gp2339.vr, gp2339.va], [0, 500]);
});

test("calcularAlimentacao: boleto opcional e diferença sinalizada", () => {
  const ts = cenarioBase();
  const func = [{ id: "COL002", nome: "Bruno Sá", vr: 100, va: 0 }];
  assert.equal(C.calcularAlimentacao(ts, "2025-01", func).valor_boleto, null);
  assert.equal(C.calcularAlimentacao(ts, "2025-01", func, 150).diferenca_boleto, 50);
});

test("exportação de alimentação: nome do arquivo e colunas VR/VA no .xlsx", () => {
  const ts = cenarioBase();
  const res = C.calcularAlimentacao(ts, "2025-01", [
    { id: "COL001", nome: "Ana Lima", vr: 200, va: 100 },
  ]);
  const exp = C.prepararExport(res, { fornecedor: "iFood", lancamento: "86950", periodo: "01/01 a 15/01" });
  assert.equal(exp.nomeArquivo, "25-01-Alimentacao-iFood-86950.xlsx");
  assert.equal(C.nomeArquivoAlimentacao("2025-01", "Alelo", "16/01 a 31/01"), "25-01-Alimentacao-Alelo-16_01 a 31_01.xlsx");
  assert.equal(C.nomeArquivoAlimentacao("2025-01", "Alelo", ""), "25-01-Alimentacao-Alelo.xlsx");

  const wb = XLSX.read(XLSX.write(C.montarWorkbook(res, exp), { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets.Rateio, { header: 1 });
  const cab = aoa.findIndex((r) => r[0] === "GP");
  assert.deepEqual(aoa[cab], ["GP", "HORAS", "VR", "VA", "VALOR", "PROPORÇÃO", "VALOR FINAL"]);
  const total = aoa.find((r) => r[0] === "TOTAL");
  assert.deepEqual([total[2], total[3], total[4], total[6]], [200, 100, 300, 300]);
  const det = XLSX.utils.sheet_to_json(wb.Sheets.Detalhe_Funcionarios, { header: 1 });
  const iVr = det[0].indexOf("VR Rateado"), iVa = det[0].indexOf("VA Rateado");
  assert.ok(iVr > 0 && iVa === iVr + 1);
  assert.deepEqual([det[1][iVr], det[1][iVa], det[1].at(-1)], [100, 50, "Rateado"]);
});

// ----------------------------------------------------- alimentação por lançamento (CONTROLE)
/** Planilha de CONTROLE no layout real: abas CONTROLE, COLABORADOR, IFOOD e ALELO. */
function controleWorkbook() {
  const JAN25 = new Date(2025, 0, 1), ABR25 = new Date(2025, 3, 1);
  const controle = XLSX.utils.aoa_to_sheet([
    ["N_LANCAMENTO", "VENCIMENTO", "MES_PGT", "MÊS_COMPETENCIA", "VALOR", "PERIODO", "MEIO", "TIPO", "OBS"],
    [73338, new Date(2025, 0, 3), JAN25, JAN25, 800, "06/01 a 15/01", "ALELO", "ALIMENTAÇÃO"],
    [79539, new Date(2025, 0, 3), JAN25, JAN25, 400, "06/01 a 15/01", "ALELO", "REFEIÇÃO"],
    [81118, new Date(2025, 2, 27), new Date(2025, 2, 1), ABR25, 1475, "01/04 a 15/04", "IFOOD", "ALIMENTAÇÃO/REFEIÇÃO"],
    [86934, new Date(2025, 3, 14), ABR25, ABR25, 900, "16/04 a 30/04", "IFOOD", "ALIMENTAÇÃO/REFEIÇÃO"],
  ]);
  const colaborador = XLSX.utils.aoa_to_sheet([
    ["Id Colaborador", "Nome Colaborador"],
    ["COL001", "Armando Neto"],
    ["COL002", "Arthur Amaral"],
  ]);
  const ifood = XLSX.utils.aoa_to_sheet([
    ["ID_COLABORADOR", "COLABORADOR", "MÊS", "QUINZENA", "VALE REFEIÇÃO", "VALE ALIMENTAÇÃO", "TOTAL", "N_LANCAMENTO"],
    ["COL001", "Armando Jose", ABR25, 1, 550, null, 550, 81118],
    ["COL002", "Arthur Amaral", ABR25, 1, null, 550, 550, 81118],
    [345, "Mariana Dantas", ABR25, 1, 275, 100, 375, 81118],
    ["COL001", "Armando Jose", ABR25, 2, 350, null, 350, 86934],
    ["COL002", "Arthur Amaral", ABR25, 2, null, 350, 350, 86934],
    [345, "Mariana Dantas", ABR25, 2, 100, 100, 200, 86934],
  ]);
  const alelo = XLSX.utils.aoa_to_sheet([
    ["ID_COLABORADOR", "COLABORADOR", "MÊS", "QUINZENA", "VALE REFEIÇÃO", "VALE ALIMENTAÇÃO", "LANÇAMENGO_REF", "LANÇAMENTO_ALI"],
    ["COL001", "Armando", JAN25, 1, 400, null, 79539, 73338],
    ["COL002", "Arthur", JAN25, 1, null, 400, 79539, 73338],
    [345, "Mariana Dantas", JAN25, 1, null, 400, 79539, 73338],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, controle, "CONTROLE");
  XLSX.utils.book_append_sheet(wb, colaborador, "COLABORADOR");
  XLSX.utils.book_append_sheet(wb, ifood, "IFOOD");
  XLSX.utils.book_append_sheet(wb, alelo, "ALELO");
  return wb;
}

test("lerControleAlimentacao separa por lançamento (não soma o histórico da pessoa)", () => {
  const lancs = C.lerControleAlimentacao(controleWorkbook());
  assert.deepEqual(lancs.map((l) => l.numero), ["86934", "81118", "79539", "73338"]);

  const l = lancs.find((x) => x.numero === "81118");
  assert.equal(l.fornecedor, "iFood");
  assert.equal(l.tipo, "ALIMENTAÇÃO/REFEIÇÃO");
  assert.equal(l.periodo, "01/04 a 15/04");
  assert.equal(l.mes_key, "2025-04");
  assert.equal(l.vencimento, "27/03/2025");
  assert.equal(l.valor_boleto, 1475);
  assert.equal(l.total, 1475);
  assert.equal(l.diferenca, 0);
  assert.equal(l.itens.length, 3);
  // o Armando aparece em vários lançamentos: aqui vale só o deste boleto
  assert.deepEqual(l.itens.find((i) => i.id === "COL001"),
    { id: "COL001", nome: "Armando Jose", valor: 550, vr: 550, va: 0 });
  assert.deepEqual(l.itens.find((i) => i.id === "345"),
    { id: "345", nome: "Mariana Dantas", valor: 375, vr: 275, va: 100 });
  assert.equal(lancs.find((x) => x.numero === "86934").itens.find((i) => i.id === "COL001").valor, 350);
  assert.equal(l.split, false);                          // um boleto = um valor por pessoa
});

test("lerControleAlimentacao: no ALELO o VR e o VA são boletos separados", () => {
  const lancs = C.lerControleAlimentacao(controleWorkbook());
  const ref = lancs.find((l) => l.numero === "79539");
  const ali = lancs.find((l) => l.numero === "73338");
  assert.equal(ref.fornecedor, "Alelo");
  assert.deepEqual([ref.total_vr, ref.total_va, ref.total, ref.valor_boleto], [400, 0, 400, 400]);
  assert.deepEqual([ali.total_vr, ali.total_va, ali.total, ali.valor_boleto], [0, 800, 800, 800]);
  assert.equal(ali.itens.length, 2);                     // só quem tem VA nesse boleto
  assert.equal(ref.mes_key, "2025-01");
});

test("lerControleAlimentacao sinaliza diferença entre boleto e soma das pessoas", () => {
  const wb = controleWorkbook();
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets.CONTROLE, { header: 1 });
  aoa[3][4] = 1500;                                      // boleto 81118 com R$ 25 a mais
  wb.Sheets.CONTROLE = XLSX.utils.aoa_to_sheet(aoa);
  const l = C.lerControleAlimentacao(wb).find((x) => x.numero === "81118");
  assert.equal(l.valor_boleto, 1500);
  assert.equal(l.total, 1475);
  assert.equal(l.diferenca, 25);
});

test("lerArquivoAlimentacao distingue CONTROLE de pedido de recarga", () => {
  const c = C.lerArquivoAlimentacao(controleWorkbook());
  assert.equal(c.tipo, "controle");
  assert.equal(c.lancamentos.length, 4);
  const p = C.lerArquivoAlimentacao(pedidoWorkbook());
  assert.equal(p.tipo, "pedido");
  assert.equal(p.blocos.length, 2);
  assert.throws(() => C.lerArquivoAlimentacao(tsWorkbook([])), /Não reconheci a planilha/);
});

test("juntarPedido soma por Id quando a planilha traz o identificador", () => {
  const lancs = C.lerControleAlimentacao(controleWorkbook());
  const dois = C.juntarPedido(lancs.filter((l) => ["81118", "86934"].includes(l.numero)));
  const armando = dois.find((i) => i.id === "COL001");
  assert.deepEqual(armando, { id: "COL001", nome: "Armando Jose", valor: 900, vr: 900, va: 0 });
  assert.equal(dois.length, 3);
});

test("lerControleAlimentacao usa a coluna TOTAL como valor da pessoa", () => {
  const wb = controleWorkbook();
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets.IFOOD, { header: 1 });
  aoa[3][6] = 400;                                       // TOTAL da Mariana ajustado à mão (≠ VR + VA)
  wb.Sheets.IFOOD = XLSX.utils.aoa_to_sheet(aoa);
  const l = C.lerControleAlimentacao(wb).find((x) => x.numero === "81118");
  const mariana = l.itens.find((i) => i.id === "345");
  assert.equal(mariana.valor, 400);                      // vale o TOTAL
  assert.deepEqual([mariana.vr, mariana.va], [275, 100]); // VR/VA ficam como detalhe
  assert.equal(l.total, 1500);
});

test("calcularAlimentacao sem divisão VR/VA rateia um valor único", () => {
  const ts = cenarioBase();
  const func = [
    { id: "COL001", nome: "Ana Lima", valor: 550 },
    { id: "COL002", nome: "Bruno Sá", valor: 450 },
  ];
  const res = C.calcularAlimentacao(ts, "2025-01", func, 1000);
  assert.equal(res.split, false);
  assert.equal(res.total_alimentacao, 1000);
  assert.equal(res.diferenca_boleto, 0);
  assert.equal(C.round(res.tabela_final.reduce((a, r) => a + r.valor_final, 0), 2), 1000);
  assert.ok(res.tabela_final.every((r) => r.vr === undefined && r.va === undefined));

  const exp = C.prepararExport(res, { fornecedor: "iFood", lancamento: "81118" });
  assert.deepEqual(exp.extraCols, []);
  assert.match(exp.titulo, /Alimentação por GP/);
  const wb = XLSX.read(XLSX.write(C.montarWorkbook(res, exp), { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
  const linhas = XLSX.utils.sheet_to_json(wb.Sheets.Rateio, { header: 1 });
  assert.deepEqual(linhas[linhas.findIndex((r) => r[0] === "GP")], ["GP", "HORAS", "VALOR", "PROPORÇÃO", "VALOR FINAL"]);
});

test("calcularAlimentacao mantém VR/VA quando o documento traz a divisão", () => {
  const ts = cenarioBase();
  const res = C.calcularAlimentacao(ts, "2025-01", [
    { id: "COL001", nome: "Ana Lima", vr: 300, va: 250 },
  ]);
  assert.equal(res.split, true);
  assert.equal(res.total_vr, 300);
  assert.ok(res.tabela_final.every((r) => C.round(r.vr + r.va, 2) === r.valor_final));
});

test("rateio usa o valor do lançamento e fecha no boleto", () => {
  const ts = cenarioBase();
  const lanc = C.lerControleAlimentacao(controleWorkbook()).find((l) => l.numero === "81118");
  const funcionarios = lanc.itens.map((i) => ({ ...C.encontrarColaborador([
    { id: "COL001", nome: "Ana Lima" }, { id: "COL002", nome: "Bruno Sá" }, { id: "345", nome: "Carla Reis" },
  ], i), valor: i.valor }));
  const res = C.calcularAlimentacao(ts, "2025-01", funcionarios, lanc.valor_boleto);
  assert.equal(res.total_alimentacao, 1475);
  assert.equal(res.diferenca_boleto, 0);
  assert.equal(C.round(res.tabela_final.reduce((a, r) => a + r.valor_final, 0), 2), 1475);
});

test("alimentação: total fecha no boleto mesmo com proporção furada na TS", () => {
  // Bruno com proporções somando 1,10 (TS inconsistente): a distribuição muda, o total não
  const ts = C.carregarTS(tsWorkbook([
    ["COL001", "Ana Lima", JAN, 168, 2718, 168, 1.0],
    ["COL002", "Bruno Sá", JAN, 176, 2339, 176, 0.6],
    ["COL002", "Bruno Sá", JAN, 176, 2913, 88, 0.5],
  ]));
  const func = [
    { id: "COL001", nome: "Ana Lima", valor: 550 },
    { id: "COL002", nome: "Bruno Sá", valor: 450 },
  ];
  const semBoleto = C.calcularAlimentacao(ts, "2025-01", func);
  assert.equal(C.round(semBoleto.tabela_final.reduce((a, r) => a + r.valor_final, 0), 2), 1045);

  const comBoleto = C.calcularAlimentacao(ts, "2025-01", func, 1000);
  assert.equal(C.round(comBoleto.tabela_final.reduce((a, r) => a + r.valor_final, 0), 2), 1000);
  assert.equal(comBoleto.total_valor_rateado, 1045);     // o que a TS distribuiu
  assert.equal(comBoleto.proporcao_suspeita.length, 1);
  const soma = comBoleto.tabela_final.reduce((a, r) => a + r.proporcao, 0);
  assert.equal(C.round(soma, 6), 1);
});

test("alimentação com VR/VA: VR + VA continuam fechando no VALOR FINAL ajustado ao boleto", () => {
  const ts = cenarioBase();
  const res = C.calcularAlimentacao(ts, "2025-01", [
    { id: "COL001", nome: "Ana Lima", vr: 300, va: 200 },
    { id: "COL002", nome: "Bruno Sá", vr: 0, va: 500 },
  ], 1200);
  assert.equal(C.round(res.tabela_final.reduce((a, r) => a + r.valor_final, 0), 2), 1200);
  for (const r of res.tabela_final) assert.equal(C.round(r.vr + r.va, 2), r.valor_final);
  assert.equal(C.round(res.tabela_final.reduce((a, r) => a + r.vr, 0), 2), 360);   // 300/1000 do total
});
