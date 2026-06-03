"use strict";
/* Testes do núcleo (docs/core.js). Executar com: npm test  (node --test tests/) */
const test = require("node:test");
const assert = require("node:assert/strict");
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

// ---------------------------------------------------------------- colaboradores
test("colaboradores retorna distintos do mês, ordenados", () => {
  const ts = cenarioBase();
  const jan = C.colaboradores(ts, "2025-01").map((c) => c.nome);
  assert.deepEqual(jan, ["Ana Lima", "Bruno Sá", "Carla Reis"]);
  assert.deepEqual(C.colaboradores(ts, "2025-02").map((c) => c.nome), ["Davi Nunes"]);
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

// ---------------------------------------------------------------- montarWorkbook (round-trip)
test("montarWorkbook gera abas e valores que sobrevivem à releitura", () => {
  const ts = cenarioBase();
  const segurados = [
    { id: "COL001", nome: "Ana Lima", valor: 800 },
    { id: "COL002", nome: "Bruno Sá", valor: 1200.5 },
    { id: "COL003", nome: "Carla Reis", valor: 450 },
  ];
  const res = C.calcularPlanoSaude(ts, "2025-01", segurados, 2500);
  const meta = { seguradora: "Bradesco", codigo_boleto: "B1" };
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
});
