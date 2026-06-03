/* APP de Rateio por GP — versão 100% navegador (GitHub Pages).
   Lê e gera .xlsx localmente com SheetJS. Nenhum dado sai do navegador. */
"use strict";

/* ----------------------------------------------------------------------
   Núcleo de cálculo (porte fiel do rateio.py)
---------------------------------------------------------------------- */
const COLUNAS = {
  id: ["id colaborador", "id do colaborador", "id colab", "matricula"],
  nome: ["nome colaborador", "nome do colaborador", "colaborador", "nome"],
  mes: ["mes", "mes referencia", "competencia", "mes/ano"],
  gp: ["gp", "centro de custo", "cc", "numero gp"],
  horas: ["horas trabalhadas", "horas trab", "horas"],
  proporcao: ["proporcao de hora", "proporcao da hora", "proporcao das horas", "proporcao"],
};
const OBRIGATORIAS = ["nome", "mes", "gp", "horas", "proporcao"];

function norm(t) {
  if (t === null || t === undefined) return "";
  let s = String(t).trim().toLowerCase();
  s = s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return s.replace(/\s+/g, " ");
}

function mesKey(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear().toString().padStart(4, "0")}-${(v.getMonth() + 1).toString().padStart(2, "0")}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})/);
  if (m) return `${(+m[1]).toString().padStart(4, "0")}-${(+m[2]).toString().padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/](\d{4})/);
  if (m) return `${(+m[2]).toString().padStart(4, "0")}-${(+m[1]).toString().padStart(2, "0")}`;
  return null;
}

function toFloat(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/R\$/g, "").replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function round(n, d) { const f = 10 ** d; return Math.round((n + Number.EPSILON) * f) / f; }

/* Lê o workbook (SheetJS) e devolve {linhas, aba, meses}. */
function carregarTS(workbook) {
  for (const nomeAba of workbook.SheetNames) {
    const ws = workbook.Sheets[nomeAba];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
    // procura cabeçalho nas primeiras 15 linhas
    let linhaCab = -1, mapa = null;
    for (let i = 0; i < Math.min(15, aoa.length); i++) {
      const normalizados = {};
      aoa[i].forEach((c, idx) => { if (c !== null && c !== undefined) normalizados[norm(c)] = idx; });
      const m = {};
      for (const [logico, sin] of Object.entries(COLUNAS)) {
        for (const s of sin) if (s in normalizados) { m[logico] = normalizados[s]; break; }
      }
      if (OBRIGATORIAS.every((c) => c in m)) { linhaCab = i; mapa = m; break; }
    }
    if (linhaCab < 0) continue;

    const linhas = [];
    for (let r = linhaCab + 1; r < aoa.length; r++) {
      const row = aoa[r];
      const get = (col) => { const i = mapa[col]; return (i !== undefined && i < row.length) ? row[i] : null; };
      const nome = get("nome"), gp = get("gp"), mk = mesKey(get("mes"));
      if (nome === null && gp === null && mk === null) continue;
      if (mk === null || gp === null) continue;
      const id = get("id");
      linhas.push({
        id: id !== null && id !== undefined ? String(id).trim() : "",
        nome: nome !== null && nome !== undefined ? String(nome).trim() : "",
        mes_key: mk,
        gp: gp,
        horas: toFloat(get("horas")),
        proporcao: toFloat(get("proporcao")),
      });
    }
    if (linhas.length) {
      const meses = [...new Set(linhas.map((l) => l.mes_key))].sort();
      return { linhas, aba: nomeAba, meses };
    }
  }
  throw new Error(
    "Não encontrei uma aba com as colunas da planilha TS " +
    "(Nome Colaborador, Mês, GP, Horas Trabalhadas e Proporção de Hora)."
  );
}

function colaboradores(ts, mk) {
  const vistos = new Map();
  for (const l of ts.linhas) {
    if (l.mes_key !== mk) continue;
    const chave = l.id || l.nome;
    if (!vistos.has(chave)) vistos.set(chave, { id: l.id, nome: l.nome });
  }
  return [...vistos.values()].sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
}

function calcularPlanoSaude(ts, mk, segurados, valorBoleto) {
  valorBoleto = Number(valorBoleto);
  const porId = new Map(), porNome = new Map();
  let totalSegurados = 0;
  for (const s of segurados) {
    const v = toFloat(s.valor);
    totalSegurados += v;
    if (s.id) porId.set(String(s.id).trim(), v);
    if (s.nome) porNome.set(norm(s.nome), v);
  }
  const valorDoSegurado = (l) => {
    if (l.id && porId.has(l.id)) return porId.get(l.id);
    const n = norm(l.nome);
    if (porNome.has(n)) return porNome.get(n);
    return null;
  };

  const temp2 = [];
  const comHoras = new Set();
  for (const l of ts.linhas) {
    if (l.mes_key !== mk) continue;
    const v = valorDoSegurado(l);
    if (v === null) continue;
    comHoras.add(l.id || norm(l.nome));
    temp2.push({
      id: l.id, nome: l.nome, gp: l.gp, horas: l.horas, proporcao: l.proporcao,
      valor_segurado: v, valor_linha: v * l.proporcao,
    });
  }

  const valorPorGp = new Map(), horasPorGp = new Map();
  for (const r of temp2) {
    valorPorGp.set(r.gp, (valorPorGp.get(r.gp) || 0) + r.valor_linha);
    horasPorGp.set(r.gp, (horasPorGp.get(r.gp) || 0) + r.horas);
  }
  const totalValor = [...valorPorGp.values()].reduce((a, b) => a + b, 0);

  const gps = [...valorPorGp.keys()].sort((a, b) =>
    (typeof a === typeof b) ? (a > b ? 1 : a < b ? -1 : 0) : String(a).localeCompare(String(b)));
  const tabelaFinal = gps.map((gp) => {
    const valor = valorPorGp.get(gp);
    const prop = totalValor ? valor / totalValor : 0;
    return {
      gp, horas: round(horasPorGp.get(gp) || 0, 4),
      valor: round(valor, 2), proporcao: prop, valor_final: round(valorBoleto * prop, 2),
    };
  });

  // ajuste de centavos para fechar exatamente no boleto
  const somaFinal = tabelaFinal.reduce((a, r) => a + r.valor_final, 0);
  const dif = round(valorBoleto - somaFinal, 2);
  if (tabelaFinal.length && dif !== 0) {
    let maior = tabelaFinal[0];
    for (const r of tabelaFinal) if (r.valor_final > maior.valor_final) maior = r;
    maior.valor_final = round(maior.valor_final + dif, 2);
  }

  const semHoras = segurados
    .filter((s) => !comHoras.has(String(s.id || "").trim() || norm(s.nome || "")))
    .map((s) => s.nome);

  return {
    mes_key: mk,
    valor_boleto: round(valorBoleto, 2),
    total_segurados: round(totalSegurados, 2),
    total_valor_rateado: round(totalValor, 2),
    diferenca_boleto_segurados: round(valorBoleto - totalSegurados, 2),
    qtd_gps: tabelaFinal.length,
    qtd_segurados: segurados.length,
    segurados_sem_horas: semHoras,
    temp2, tabela_final: tabelaFinal,
  };
}

/* ----------------------------------------------------------------------
   Exportação .xlsx (SheetJS) — espelha exportar_xlsx do Python
---------------------------------------------------------------------- */
function sanitizar(s) { return String(s).replace(/[\\/:*?"<>|]+/g, "_").trim(); }

function nomeArquivoSaida(mk, seguradora, codigo) {
  const [ano, mes] = mk.split("-");
  return `${ano.slice(2)}-${mes}-${sanitizar(seguradora)}-${sanitizar(codigo)}.xlsx`;
}

function fmtCell(ws, r, c, z) {
  const ref = XLSX.utils.encode_cell({ r, c });
  if (ws[ref]) ws[ref].z = z;
}

function exportarXlsx(res, meta) {
  const wb = XLSX.utils.book_new();
  const tf = res.tabela_final;

  const aoa = [
    ["Rateio de Plano de Saúde por GP"],
    ["Seguradora", meta.seguradora],
    ["Código do boleto", meta.codigo_boleto],
    ["Mês", res.mes_key],
    ["Valor do boleto", res.valor_boleto],
    ["Soma dos segurados", res.total_segurados],
    [],
    ["GP", "HORAS", "VALOR", "PROPORÇÃO", "VALOR FINAL"],
  ];
  tf.forEach((r) => aoa.push([r.gp, r.horas, r.valor, r.proporcao, r.valor_final]));
  aoa.push([
    "TOTAL",
    round(tf.reduce((a, r) => a + r.horas, 0), 4),
    round(tf.reduce((a, r) => a + r.valor, 0), 2),
    round(tf.reduce((a, r) => a + r.proporcao, 0), 6),
    round(tf.reduce((a, r) => a + r.valor_final, 0), 2),
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 16 }];
  fmtCell(ws, 4, 1, "#,##0.00");
  fmtCell(ws, 5, 1, "#,##0.00");
  const ini = 8, fim = 8 + tf.length; // inclui a linha TOTAL
  for (let r = ini; r <= fim; r++) {
    fmtCell(ws, r, 2, "#,##0.00");
    fmtCell(ws, r, 3, "0.0000%");
    fmtCell(ws, r, 4, "#,##0.00");
  }
  XLSX.utils.book_append_sheet(wb, ws, "Rateio");

  // aba de auditoria
  const aoa2 = [[
    "Id Colaborador", "Nome Colaborador", "GP", "Horas Trabalhadas",
    "Proporção de Hora", "Valor Segurado", "Valor Rateado (Valor×Prop.)",
  ]];
  res.temp2.forEach((r) =>
    aoa2.push([r.id, r.nome, r.gp, r.horas, r.proporcao, round(r.valor_segurado, 2), round(r.valor_linha, 2)]));
  const ws2 = XLSX.utils.aoa_to_sheet(aoa2);
  ws2["!cols"] = [{ wch: 16 }, { wch: 28 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Detalhe_Segurados");

  XLSX.writeFile(wb, nomeArquivoSaida(res.mes_key, meta.seguradora, meta.codigo_boleto));
}

/* ----------------------------------------------------------------------
   Interface
---------------------------------------------------------------------- */
const $ = (s) => document.querySelector(s);
let TS = null, COLABS = [], ULTIMO = null;

const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  erro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
};

const fmtBRL = (v) => "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v) => (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + "%";
const fmtNum = (v) => (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const parseNum = (s) => {
  if (s == null) return 0;
  s = ("" + s).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s); return isNaN(n) ? 0 : n;
};
const mesLabel = (k) => { const [a, m] = k.split("-"); return m + "/" + a; };

function msg(el, texto, tipo) {
  el.innerHTML = texto ? `<div class="msg ${tipo}">${ICON[tipo] || ICON.info}<div>${texto}</div></div>` : "";
}

function setStep(n) {
  document.querySelectorAll(".stp").forEach((s) => {
    const i = +s.dataset.stp;
    s.classList.toggle("done", i < n);
    s.classList.toggle("active", i === n);
    s.querySelector(".dot").innerHTML = i < n
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
      : i;
  });
}

$("#btn-upload").onclick = async () => {
  const f = $("#arquivo").files[0];
  if (!f) { msg($("#ts-status"), "Selecione um arquivo .xlsx.", "erro"); return; }
  msg($("#ts-status"), "Processando planilha no navegador…", "info");
  try {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    TS = carregarTS(wb);
    msg($("#ts-status"), `Carregado — aba <b>${TS.aba}</b>, ${TS.linhas.length} linhas, ${TS.meses.length} mês(es).`, "check");
    $("#mes").innerHTML = TS.meses.map((m) => `<option value="${m}">${mesLabel(m)}</option>`).join("");
    $("#card-boleto").classList.remove("locked");
    $("#card-seg").classList.remove("locked");
    setStep(3);
    carregarColabs();
  } catch (e) {
    msg($("#ts-status"), e.message || "Não foi possível ler o arquivo.", "erro");
  }
};

$("#mes").onchange = carregarColabs;

function carregarColabs() {
  if (!TS) return;
  COLABS = colaboradores(TS, $("#mes").value);
  document.querySelectorAll(".seg-select").forEach(preencherSelect);
}

function preencherSelect(sel) {
  const atual = sel.value;
  sel.innerHTML = `<option value="">— selecione —</option>` +
    COLABS.map((c) => `<option value="${c.id}|${c.nome}">${c.nome}${c.id ? ` (${c.id})` : ""}</option>`).join("");
  sel.value = atual;
}

function addSeg() {
  const div = document.createElement("div");
  div.className = "seg-row";
  div.innerHTML =
    `<div><label>Segurado</label><select class="seg-select"></select></div>` +
    `<div><label>Valor</label><div class="field"><span class="pre">R$</span><input class="seg-valor has-pre" inputmode="decimal" placeholder="0,00" /></div></div>` +
    `<div><button class="icon-btn" title="Remover segurado" aria-label="Remover segurado">${ICON.trash}</button></div>`;
  $("#seg-lista").appendChild(div);
  preencherSelect(div.querySelector(".seg-select"));
  div.querySelector(".icon-btn").onclick = () => { div.remove(); recalcSoma(); };
  div.querySelector(".seg-valor").oninput = recalcSoma;
  div.querySelector(".seg-select").onchange = () => setStep(4);
  recalcSoma();
}
$("#btn-add-seg").onclick = addSeg;

function lerSegurados() {
  const out = [];
  document.querySelectorAll(".seg-row").forEach((row) => {
    const v = row.querySelector(".seg-select").value;
    const valor = parseNum(row.querySelector(".seg-valor").value);
    if (v) { const [id, nome] = v.split("|"); out.push({ id, nome, valor }); }
  });
  return out;
}

function recalcSoma() {
  const soma = lerSegurados().reduce((a, s) => a + s.valor, 0);
  const boleto = parseNum($("#valor_boleto").value);
  const dif = boleto - soma;
  $("#soma-seg").textContent = fmtBRL(soma);
  $("#soma-boleto").textContent = fmtBRL(boleto);
  $("#soma-dif").textContent = fmtBRL(dif);
  $("#chip-dif").classList.toggle("neg", dif < -0.005);
}
$("#valor_boleto").oninput = recalcSoma;

$("#btn-calc").onclick = () => {
  const st = $("#calc-status");
  if (!TS) { msg(st, "Importe a planilha TS primeiro.", "erro"); return; }
  const mes = $("#mes").value;
  const seguradora = $("#seguradora").value.trim();
  const codigo = $("#codigo").value.trim();
  const valorBoleto = parseNum($("#valor_boleto").value);
  const segurados = lerSegurados();

  if (!seguradora || !codigo) { msg(st, "Informe a seguradora e o código do boleto.", "erro"); return; }
  if (valorBoleto <= 0) { msg(st, "O valor do boleto deve ser maior que zero.", "erro"); return; }
  if (!segurados.length) { msg(st, "Adicione ao menos um segurado.", "erro"); return; }

  const res = calcularPlanoSaude(TS, mes, segurados, valorBoleto);
  if (!res.tabela_final.length) {
    msg(st, "Nenhuma hora encontrada na TS para os segurados no mês selecionado.", "erro");
    return;
  }
  msg(st, "", "");
  ULTIMO = { res, meta: { seguradora, codigo_boleto: codigo } };
  mostrarResultado(res);
};

function mostrarResultado(d) {
  let avisos = "";
  if (d.segurados_sem_horas.length)
    avisos += `<div class="msg warn">${ICON.warn}<div>Sem horas na TS no mês (não rateados): ${d.segurados_sem_horas.join(", ")}</div></div>`;
  if (Math.abs(d.diferenca_boleto_segurados) > 0.009)
    avisos += `<div class="msg warn">${ICON.warn}<div>Boleto e soma dos segurados diferem em ${fmtBRL(d.diferenca_boleto_segurados)}. O VALOR FINAL foi rateado pelo valor do boleto.</div></div>`;
  avisos += `<div class="msg ok">${ICON.check}<div>Rateio gerado: ${d.qtd_gps} GP(s), ${d.qtd_segurados} segurado(s).</div></div>`;
  $("#result-msgs").innerHTML = avisos;

  let html = `<thead><tr><th>GP</th><th class="num">Horas</th><th class="num">Valor</th><th class="num">Proporção</th><th class="num">Valor Final</th></tr></thead><tbody>`;
  let tH = 0, tV = 0, tP = 0, tF = 0;
  d.tabela_final.forEach((r) => {
    tH += r.horas; tV += r.valor; tP += r.proporcao; tF += r.valor_final;
    html += `<tr><td>${r.gp}</td><td class="num">${fmtNum(r.horas)}</td><td class="num">${fmtBRL(r.valor)}</td><td class="num">${fmtPct(r.proporcao)}</td><td class="num">${fmtBRL(r.valor_final)}</td></tr>`;
  });
  html += `</tbody><tfoot><tr class="total"><td>TOTAL</td><td class="num">${fmtNum(tH)}</td><td class="num">${fmtBRL(tV)}</td><td class="num">${fmtPct(tP)}</td><td class="num">${fmtBRL(tF)}</td></tr></tfoot>`;
  $("#tabela-final").innerHTML = html;
  $("#card-result").style.display = "block";
  setStep(5);
  $("#card-result").scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#btn-download").onclick = () => { if (ULTIMO) exportarXlsx(ULTIMO.res, ULTIMO.meta); };

addSeg();
