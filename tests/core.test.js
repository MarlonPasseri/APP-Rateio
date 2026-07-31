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
