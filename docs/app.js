/* Interface do APP de Rateio por GP (camada de apresentação).
   Toda a lógica de domínio vive em core.js (RateioCore). Aqui só há DOM/eventos. */
"use strict";

const C = window.RateioCore;
const $ = (s) => document.querySelector(s);
let TS = null, COLABS = [], ULTIMO = null, TIPO = "saude";

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
function msgs(el, lista, tipo) {
  el.innerHTML = (lista || []).map((t) => `<div class="msg ${tipo}">${ICON[tipo] || ICON.info}<div>${t}</div></div>`).join("");
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

// ---- Tipo de rateio (Plano de Saúde | Férias) ----
const ROTULO = () => (TIPO === "ferias" ? "funcionário" : "segurado");
const capitaliza = (s) => s[0].toUpperCase() + s.slice(1);

function setTipo(t) {
  if (t !== "saude" && t !== "ferias") return;
  TIPO = t;
  const fer = t === "ferias";
  document.body.classList.toggle("modo-ferias", fer);
  document.querySelectorAll(".tipo[data-tipo]").forEach((c) => c.classList.toggle("sel", c.dataset.tipo === t));
  $("#titulo-dados").textContent = fer ? "Mês de referência" : "Dados do boleto";
  $("#sub-dados").textContent = fer ? "Mês das férias a ratear" : "Identificação e valor total do boleto";
  $("#titulo-seg").textContent = fer ? "Funcionários e valores de férias" : "Segurados e valores";
  $("#sub-seg").textContent = fer ? "Valor de férias de cada funcionário" : "Valor por segurado já incluindo dependentes, se houver";
  $("#lbl-seg-add").textContent = fer ? "Adicionar funcionário" : "Adicionar segurado";
  $("#lbl-soma").textContent = fer ? "Soma das férias" : "Soma dos segurados";
  document.querySelector('.stp[data-stp="4"] .label-txt').textContent = fer ? "Funcionários" : "Segurados";
  document.querySelectorAll(".seg-row .seg-input").forEach((inp) => {
    inp.parentElement.querySelector("label").textContent = capitaliza(ROTULO());
  });
  recalcSoma();
}
document.querySelectorAll(".tipo[data-tipo]").forEach((c) => {
  c.onclick = () => setTipo(c.dataset.tipo);
  c.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTipo(c.dataset.tipo); } };
});

$("#btn-upload").onclick = async () => {
  const f = $("#arquivo").files[0];
  if (!f) { msg($("#ts-status"), "Selecione um arquivo .xlsx.", "erro"); return; }
  msg($("#ts-status"), "Processando planilha no navegador…", "info");
  try {
    const buf = await f.arrayBuffer();
    const wb = C.XLSX.read(buf, { type: "array", cellDates: true });
    TS = C.carregarTS(wb);
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

const COLAB_MAP = new Map();                       // texto exibido -> {id, nome}
const displayColab = (c) => `${c.nome}${c.id ? ` (${c.id})` : ""}`;
const fmtMoedaInput = (el) => {
  const n = parseNum(el.value);
  el.value = n ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
};

function carregarColabs() {
  if (!TS) return;
  COLABS = C.colaboradores(TS, $("#mes").value);
  COLAB_MAP.clear();
  COLABS.forEach((c) => COLAB_MAP.set(displayColab(c), { id: c.id, nome: c.nome }));
  $("#lista-colabs").innerHTML = COLABS.map((c) => `<option value="${displayColab(c)}"></option>`).join("");
  revisarSegurados();
}

function addSeg() {
  const div = document.createElement("div");
  div.className = "seg-row";
  const rot = capitaliza(ROTULO());
  div.innerHTML =
    `<div><label>${rot}</label><input class="seg-input" list="lista-colabs" placeholder="Digite para buscar…" autocomplete="off" /></div>` +
    `<div><label>Valor</label><div class="field"><span class="pre">R$</span><input class="seg-valor has-pre" inputmode="decimal" placeholder="0,00" /></div></div>` +
    `<div><button class="icon-btn" title="Remover ${ROTULO()}" aria-label="Remover ${ROTULO()}">${ICON.trash}</button></div>`;
  $("#seg-lista").appendChild(div);
  const inp = div.querySelector(".seg-input");
  const val = div.querySelector(".seg-valor");
  div.querySelector(".icon-btn").onclick = () => { div.remove(); recalcSoma(); revisarSegurados(); };
  val.oninput = recalcSoma;
  val.onblur = () => fmtMoedaInput(val);
  inp.oninput = () => { setStep(4); revisarSegurados(); };
  recalcSoma();
}
$("#btn-add-seg").onclick = addSeg;

function lerSegurados() {
  const out = [];
  document.querySelectorAll(".seg-row").forEach((row) => {
    const txt = row.querySelector(".seg-input").value.trim();
    const valor = parseNum(row.querySelector(".seg-valor").value);
    if (!txt) return;
    const c = COLAB_MAP.get(txt);
    out.push(c ? { id: c.id, nome: c.nome, valor } : { id: "", nome: txt, valor });
  });
  return out;
}

// Marca duplicados e avisa sobre nomes que não existem no mês selecionado (polimentos 4 e 5).
function revisarSegurados() {
  const rows = [...document.querySelectorAll(".seg-row")];
  const contagem = new Map();
  rows.forEach((row) => {
    const t = row.querySelector(".seg-input").value.trim();
    if (t) contagem.set(t, (contagem.get(t) || 0) + 1);
  });
  const foraDoMes = [];
  rows.forEach((row) => {
    const inp = row.querySelector(".seg-input");
    const t = inp.value.trim();
    inp.classList.toggle("dup", !!t && contagem.get(t) > 1);
    if (t && COLABS.length && !COLAB_MAP.has(t)) foraDoMes.push(t);
  });
  msg($("#seg-status"), foraDoMes.length
    ? `Não consta(m) no mês selecionado: ${[...new Set(foraDoMes)].join(", ")}. Confira o nome ou o mês.`
    : "", "warn");
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
$("#valor_boleto").onblur = () => fmtMoedaInput($("#valor_boleto"));

$("#btn-calc").onclick = () => {
  const st = $("#calc-status");
  if (!TS) { msg(st, "Importe a planilha TS primeiro.", "erro"); return; }
  const mes = $("#mes").value;
  const pessoas = lerSegurados();

  let res, extra;
  if (TIPO === "ferias") {
    const v = C.validarFerias({ mes, funcionarios: pessoas });
    if (!v.ok) { msgs(st, v.erros, "erro"); return; }
    res = C.calcularFerias(TS, mes, pessoas);
    extra = {};
  } else {
    const entrada = {
      mes,
      seguradora: $("#seguradora").value.trim(),
      codigo_boleto: $("#codigo").value.trim(),
      valor_boleto: parseNum($("#valor_boleto").value),
      segurados: pessoas,
    };
    const v = C.validarEntrada(entrada);
    if (!v.ok) { msgs(st, v.erros, "erro"); return; }
    res = C.calcularPlanoSaude(TS, mes, entrada.segurados, entrada.valor_boleto);
    extra = { seguradora: entrada.seguradora, codigo_boleto: entrada.codigo_boleto };
  }

  if (!res.tabela_final.length) {
    msg(st, `Nenhuma hora encontrada na TS para os ${ROTULO()}s no mês selecionado.`, "erro");
    return;
  }
  msg(st, "", "");
  ULTIMO = { res, extra };
  mostrarResultado(res);
};

function mostrarResultado(d) {
  const rotulo = d.tipo === "ferias" ? "funcionário" : "segurado";
  const qtdPessoas = d.tipo === "ferias" ? d.qtd_funcionarios : d.qtd_segurados;
  let avisos = "";
  if (d.sem_horas.length)
    avisos += `<div class="msg warn">${ICON.warn}<div>Sem horas na TS no mês (não rateados): ${d.sem_horas.join(", ")}</div></div>`;
  if (d.proporcao_suspeita && d.proporcao_suspeita.length)
    avisos += `<div class="msg warn">${ICON.warn}<div>Proporções da TS não somam 100% no mês para: ${d.proporcao_suspeita.map((x) => `${x.nome} (${(x.soma * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)`).join(", ")}. A distribuição entre GPs pode estar distorcida — verifique a planilha.</div></div>`;
  if (d.tipo === "plano_saude" && Math.abs(d.diferenca_boleto_segurados) > 0.009)
    avisos += `<div class="msg warn">${ICON.warn}<div>Boleto e soma dos segurados diferem em ${fmtBRL(d.diferenca_boleto_segurados)}. O VALOR FINAL foi rateado pelo valor do boleto.</div></div>`;
  avisos += `<div class="msg ok">${ICON.check}<div>Rateio gerado: ${d.qtd_gps} GP(s), ${qtdPessoas} ${rotulo}(s).</div></div>`;
  $("#result-msgs").innerHTML = avisos;

  let html = `<thead><tr><th>GP</th><th class="num">Horas</th><th class="num">Valor</th><th class="num">Proporção</th><th class="num">Valor Final</th></tr></thead><tbody>`;
  let tH = 0, tV = 0, tP = 0, tF = 0;
  d.tabela_final.forEach((r) => {
    tH += r.horas; tV += r.valor; tP += r.proporcao; tF += r.valor_final;
    html += `<tr><td>${r.gp}</td><td class="num">${fmtNum(r.horas)}</td><td class="num">${fmtBRL(r.valor)}</td><td class="num">${fmtPct(r.proporcao)}</td><td class="num">${fmtBRL(r.valor_final)}</td></tr>`;
  });
  html += `</tbody><tfoot><tr class="total"><td>TOTAL</td><td class="num">${fmtNum(tH)}</td><td class="num">${fmtBRL(tV)}</td><td class="num">${fmtPct(tP)}</td><td class="num">${fmtBRL(tF)}</td></tr></tfoot>`;
  $("#tabela-final").innerHTML = html;
  const cr = $("#card-result");
  cr.classList.remove("hidden");
  cr.classList.add("in");
  setStep(5);
  cr.scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#btn-download").onclick = () => {
  if (!ULTIMO) return;
  const exp = C.prepararExport(ULTIMO.res, ULTIMO.extra);
  const wb = C.montarWorkbook(ULTIMO.res, exp);
  C.XLSX.writeFile(wb, exp.nomeArquivo);
};

addSeg();
