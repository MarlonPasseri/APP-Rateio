"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const C = require("../docs/core.js");

// Dados fictícios: formato do relatório, sem dados pessoais dos PDFs reais.
const AMIL = `Demonstrativo Analítico de Faturamento
Operadora: AMIL
Mensalidade - 09/2026
Contrato 1234567890 - EMPRESA TESTE
N. Fiscal 123456 Emissão 17/09/2026 Vencimento 28/09/2026
099000001 ANA TESTE 1234567890 01234567890 AMIL S450 QP NAC R COPART PJ T 37 15/09/2026 Mens. Titular Faixa Etária Implant. 469,46 1.199,94
099000002 DEPENDENTE TESTE 01234567890 11111111111 AMIL S450 QP NAC R COPART PJ D 36 Conjuge 15/09/2026 Mens. Depend. Faixa Etária Implant. 469,46
Demonstrativo Analítico de Faturamento
Contrato 1234567890 - EMPRESA TESTE
N. Fiscal 123456 Emissão 17/09/2026 Vencimento 28/09/2026
099000003 FILHO TESTE 01234567890 22222222222 AMIL S450 QP NAC R COPART PJ D 7 Filho/Filha 30/06/2044 15/09/2026 Mens. Depend. Faixa Etária Implant. 261,02
Total Contrato 3 Titulares: 1 Dependentes: 2 Agregados: 0 Patrocinadores: 0 Valor: 1.199,94
Total Geral 1.199,94`;

test("Amil: matrícula agrupa dependentes entre páginas sem duplicar Valor Total", () => {
  const r = C.parseBoletoPdfText(AMIL);
  assert.equal(r.seguradora, "Amil");
  assert.equal(r.codigo_boleto, "123456");
  assert.equal(r.contrato, "1234567890");
  assert.equal(r.empresa, "EMPRESA TESTE");
  assert.equal(r.mes, "2026-09");
  assert.equal(r.vencimento, "28/09/2026");
  assert.equal(r.qtd_segurados, 3);
  assert.deepEqual(r.pessoas, [{ id: "AMIL-01234567890", nome: "ANA TESTE", cpf: "01234567890", valor: 1199.94 }]);
  assert.equal(r.total_familias, r.valor_boleto);
});

test("Amil: agregado também entra no total da família", () => {
  const r = C.parseBoletoAmil(AMIL.replace("PJ D 7 Filho/Filha", "PJ A 7 Neto (a)")
    .replace("Mens. Depend. Faixa Etária Implant. 261,02", "Mens. Agregado Faixa Etária Implat. 261,02"));
  assert.equal(r.pessoas[0].valor, 1199.94);
});

test("Amil: aceita matrícula colada ao final do nome", () => {
  const r = C.parseBoletoAmil(AMIL.replace("ANA TESTE 1234567890", "ANA TESTE1234567890"));
  assert.equal(r.pessoas[0].nome, "ANA TESTE");
});

test("Amil: rejeita páginas faltando ou família sem titular", () => {
  assert.throws(() => C.parseBoletoAmil(AMIL.replace(/^099000003.*\n/m, "")), /total de uma família/i);
  assert.throws(() => C.parseBoletoAmil(AMIL.replace(/^099000001.*\n/m, "")), /sem titular/i);
  assert.throws(() => C.parseBoletoAmil(AMIL.replace("Total Contrato 3", "Total Contrato 4")), /quantidade/i);
});

test("Amil: Total Geral preserva ajustes do documento sem alterar os valores familiares", () => {
  const r = C.parseBoletoAmil(AMIL.replace("Total Geral 1.199,94", "Total Geral 1.189,94"));
  assert.equal(r.valor_boleto, 1189.94);
  assert.equal(r.total_familias, 1199.94);
});

test("Amil: combinação de empresas acumula famílias e documentos", () => {
  const a = C.parseBoletoAmil(AMIL);
  const b = C.parseBoletoAmil(AMIL.replace("123456 Emissão", "654321 Emissão"));
  const r = C.combinarBoletos([a, b]);
  assert.equal(r.pessoas.length, 1);
  assert.equal(r.pessoas[0].valor, 2399.88);
  assert.equal(r.valor_boleto, 2399.88);
  assert.equal(r.codigo_boleto, "123456 + 654321");
  assert.throws(() => C.combinarBoletos([a, { ...b, mes: "2026-10" }]), /mesma competência/);
});

test("leitor PDF ordena linhas pelas coordenadas visuais em páginas normais e giradas", async () => {
  for (const girada of [false, true]) {
    let destruido = false;
    const window = { dispatchEvent() {}, pdfjsLib: {
      GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({
        numPages: 1, getPage: async () => ({
          getTextContent: async () => ({ items: [
            { str: "fim", transform: [1, 0, 0, 1, ... (girada ? [80, 10] : [10, 80])] },
            { str: "linha", transform: [1, 0, 0, 1, ... (girada ? [90, 30] : [30, 90])] },
            { str: "primeira", transform: [1, 0, 0, 1, ... (girada ? [90, 10] : [10, 90])] },
          ] }),
          getViewport: () => ({ convertToViewportPoint: (x, y) => girada ? [y, 100 - x] : [x, 100 - y] }),
          cleanup() {},
        }),
      }), destroy: async () => { destruido = true; } }),
    } };
    vm.runInNewContext(fs.readFileSync(require.resolve("../docs/pdf-reader.js"), "utf8"), {
      window, CustomEvent: class {}, Uint8Array,
    });
    const texto = await window.RateioPdf.extrairTexto({ arrayBuffer: async () => new ArrayBuffer(0) });
    assert.equal(texto, "primeira linha\nfim");
    assert.equal(destruido, true);
  }
});
