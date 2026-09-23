/* Interface do APP de Rateio por GP. O domínio permanece em core.js. */
"use strict";

const C = window.RateioCore;
const $ = (s) => document.querySelector(s);

let TS = null;
let COLABS = [];
let ULTIMO = null;
let TIPO = "saude";
let FILTRO = "todos";
let MES_ATUAL = "";
let ARQUIVO_TS = "";
let RESULT_ROWS = [];
let BLOCOS = [];            // pedido de recarga: blocos por quinzena
let LANCAMENTOS = [];       // planilha de CONTROLE: um item por lançamento (boleto)
let IMPORT_TIPO = "";       // "controle" | "pedido"
let PENDENTES = [];

const COLAB_MAP = new Map();
const VALORES_POR_MES = new Map();

const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  erro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 6-12 12M6 6l12 12"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4h8v2"/></svg>',
};

const fmtBRL = (v) => "R$ " + (v || 0).toLocaleString("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmtPct = (v) => (v * 100).toLocaleString("pt-BR", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
}) + "%";
const fmtNum = (v) => (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const parseNum = (s) => {
  if (s === null || s === undefined) return 0;
  const limpo = String(s).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(limpo);
  return Number.isFinite(n) ? n : 0;
};
const valorMoeda = (n) => n ? n.toLocaleString("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}) : "";
const mesLabel = (k) => {
  const [ano, mes] = String(k || "").split("-");
  return ano && mes ? `${mes}/${ano}` : "";
};
const displayColab = (c) => `${c.nome}${c.id ? ` (${c.id})` : ""}`;
const chavePessoa = (p) => String(p.id || "").trim() || C.norm(p.nome || "");
const normalizarId = (id) => {
  const valor = String(id || "").trim();
  if (!valor) return "";
  return valor.replace(/^0+(?=\d)/, "");
};
const ROTULO = () => (TIPO === "saude" ? "segurado" : "funcionário");
const capitaliza = (s) => s ? s[0].toUpperCase() + s.slice(1) : "";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

function msg(el, texto, tipo = "info") {
  el.replaceChildren();
  if (!texto) return;
  const box = document.createElement("div");
  box.className = `msg ${tipo}`;
  box.setAttribute("role", tipo === "erro" ? "alert" : "status");
  box.innerHTML = ICON[tipo] || ICON.info;
  const conteudo = document.createElement("div");
  conteudo.textContent = texto;
  box.appendChild(conteudo);
  el.appendChild(box);
}

function msgs(el, lista, tipo = "erro") {
  el.replaceChildren();
  (lista || []).forEach((texto) => {
    const box = document.createElement("div");
    box.className = `msg ${tipo}`;
    box.setAttribute("role", tipo === "erro" ? "alert" : "status");
    box.innerHTML = ICON[tipo] || ICON.info;
    const conteudo = document.createElement("div");
    conteudo.textContent = texto;
    box.appendChild(conteudo);
    el.appendChild(box);
  });
}

function setStep(n) {
  const steps = [...document.querySelectorAll(".stp")];
  steps.forEach((step) => {
    const i = Number(step.dataset.stp);
    step.classList.toggle("done", i < n);
    step.classList.toggle("active", i === n);
    step.disabled = (i === 3 && !TS) || (i === 4 && !ULTIMO);
    if (i === n) step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
    step.querySelector(".dot").innerHTML = i < n ? ICON.check : String(i);
  });
  document.querySelectorAll(".stp-line").forEach((line, index) => {
    line.classList.toggle("done", index < n - 1);
  });
  $("#stepper").dataset.current = String(n);
}

document.querySelectorAll(".stp[data-target]").forEach((step) => {
  step.addEventListener("click", () => {
    if (step.disabled) return;
    const target = document.getElementById(step.dataset.target);
    if (target && !target.classList.contains("hidden")) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

function setBusy(section, button, busy) {
  section?.classList.toggle("is-processing", busy);
  section?.setAttribute("aria-busy", String(busy));
  button?.classList.toggle("is-loading", busy);
  if (button) button.disabled = busy;
}

function invalidarResultado() {
  if (!ULTIMO) return;
  ULTIMO = null;
  RESULT_ROWS = [];
  $("#card-result").classList.add("hidden");
  setStep(TS ? 3 : 2);
}

const TEXTOS = {
  saude: {
    corpo: "modo-saude", nome: "Plano de Saúde", mes: "Mês de referência",
    dados: ["Dados do boleto", "Identificação e valor total"],
    pessoas: ["Segurados e valores", "Informe o valor do plano de quem participa"],
    soma: "Soma dos segurados", resultado: "Segurados",
  },
  ferias: {
    corpo: "modo-ferias", nome: "Férias", mes: "Mês de referência",
    dados: ["Dados das férias", "Mês de referência do pagamento"],
    pessoas: ["Funcionários e valores de férias", "Informe o valor das férias de quem participa"],
    soma: "Soma das férias", resultado: "Funcionários",
  },
  alimentacao: {
    corpo: "modo-alim", nome: "Alimentação", mes: "Mês de competência",
    dados: ["Dados do lançamento", "Fornecedor, competência e boleto de VR/VA"],
    pessoas: ["Funcionários e valores (VR/VA)", "Importe o pedido de recarga ou informe VR e VA de quem participa"],
    soma: "Soma do pedido", resultado: "Funcionários",
  },
};

function setTipo(tipo) {
  if (!TEXTOS[tipo]) return;
  if (TIPO !== tipo) invalidarResultado();
  TIPO = tipo;
  const tx = TEXTOS[tipo];

  Object.values(TEXTOS).forEach((t) => document.body.classList.toggle(t.corpo, t === tx));
  document.querySelectorAll(".type-option[data-tipo]").forEach((button) => {
    const ativo = button.dataset.tipo === tipo;
    button.classList.toggle("selected", ativo);
    button.setAttribute("aria-pressed", String(ativo));
  });

  $("#titulo-dados").textContent = tx.dados[0];
  $("#sub-dados").textContent = tx.dados[1];
  $("#lbl-mes").textContent = tx.mes;
  $("#titulo-seg").textContent = tx.pessoas[0];
  $("#sub-seg").textContent = tx.pessoas[1];
  $("#lbl-soma").textContent = tx.soma;
  $("#result-pessoas-label").textContent = tx.resultado;
  $("#header-tipo").textContent = tx.nome;
  recalcSoma();
}

document.querySelectorAll(".type-option[data-tipo]").forEach((button) => {
  button.addEventListener("click", () => setTipo(button.dataset.tipo));
});

function selecionarArquivo(file) {
  if (!file) return;
  $("#selected-file-name").textContent = file.name;
  $("#selected-file-meta").textContent = formatBytes(file.size);
  $("#selected-file").classList.remove("hidden");
  msg($("#ts-status"), "", "");
}

$("#arquivo").addEventListener("change", () => selecionarArquivo($("#arquivo").files[0]));

const dropZone = $("#drop-zone");
["dragenter", "dragover"].forEach((evento) => {
  dropZone.addEventListener(evento, (e) => {
    e.preventDefault();
    dropZone.classList.add("dragging");
  });
});
["dragleave", "drop"].forEach((evento) => {
  dropZone.addEventListener(evento, (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragging");
  });
});
dropZone.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const dt = new DataTransfer();
  dt.items.add(file);
  $("#arquivo").files = dt.files;
  selecionarArquivo(file);
});

function exigirXLSX() {
  if (!C || !C.XLSX || typeof C.XLSX.read !== "function") {
    throw new Error("A biblioteca de planilhas não foi carregada. Atualize a página e tente novamente.");
  }
  return C.XLSX;
}

async function carregarArquivoTS() {
  const file = $("#arquivo").files[0];
  if (!file) {
    msg($("#ts-status"), "Selecione uma planilha TS.", "erro");
    return;
  }

  msg($("#ts-status"), "Lendo a planilha TS...", "info");
  setBusy($("#card-ts"), $("#btn-upload"), true);
  try {
    const XLSX = exigirXLSX();
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const novaTS = C.carregarTS(workbook);
    ativarTS(novaTS, file.name);
    $("#workspace").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    msg($("#ts-status"), e.message || "Não foi possível ler a planilha.", "erro");
  } finally {
    setBusy($("#card-ts"), $("#btn-upload"), false);
  }
}

$("#btn-upload").addEventListener("click", carregarArquivoTS);

function ativarTS(novaTS, nomeArquivo) {
  TS = novaTS;
  ARQUIVO_TS = nomeArquivo;
  ULTIMO = null;
  VALORES_POR_MES.clear();
  $("#card-result").classList.add("hidden");
  $("#boleto-arquivo").value = "";
  $("#boleto-summary").classList.add("hidden");
  msg($("#boleto-status"), "", "");
  $("#mes").innerHTML = TS.meses.map((m) => `<option value="${esc(m)}">${esc(mesLabel(m))}</option>`).join("");
  MES_ATUAL = TS.meses[0] || "";
  $("#mes").value = MES_ATUAL;

  carregarColabs();
  atualizarResumoTS();
  $("#upload-empty").classList.add("hidden");
  $("#ts-summary").classList.remove("hidden");
  $("#workspace").classList.remove("hidden");
  $("#header-context").classList.remove("hidden");
  setStep(3);
  msg($("#ts-status"), "", "");
}
$("#btn-trocar-ts").addEventListener("click", () => {
  $("#arquivo").value = "";
  $("#selected-file").classList.add("hidden");
  $("#upload-empty").classList.remove("hidden");
  $("#ts-summary").classList.add("hidden");
  $("#arquivo").click();
});

function atualizarResumoTS() {
  if (!TS) return;
  $("#ts-file-name").textContent = ARQUIVO_TS;
  $("#ts-file-meta").textContent =
    `${mesLabel(MES_ATUAL)} · ${COLABS.length} colaboradores · ${TS.linhas.length} linhas`;
  $("#header-mes").textContent = mesLabel(MES_ATUAL);
}

function encontrarColab(pessoa) {
  return C.encontrarColaborador(COLABS, pessoa);
}

function salvarValoresMes() {
  if (!MES_ATUAL) return;
  const valores = [];
  document.querySelectorAll(".seg-row").forEach((row) => {
    const nome = row.dataset.manual === "true"
      ? row.querySelector(".seg-input").value.trim()
      : row.dataset.nome;
    const valor = row.querySelector(".seg-valor").value.trim();
    const vr = row.querySelector(".seg-vr").value.trim();
    const va = row.querySelector(".seg-va").value.trim();
    if (nome || valor || vr || va) {
      valores.push({
        id: row.dataset.id || "",
        nome,
        valor,
        vr,
        va,
        manual: row.dataset.manual === "true",
      });
    }
  });
  VALORES_POR_MES.set(MES_ATUAL, valores);
}

function carregarColabs() {
  if (!TS || !MES_ATUAL) return;
  COLABS = C.colaboradores(TS, MES_ATUAL);
  COLAB_MAP.clear();
  COLABS.forEach((c) => {
    COLAB_MAP.set(chavePessoa(c), c);
    COLAB_MAP.set(C.norm(c.nome), c);
  });

  const salvos = VALORES_POR_MES.get(MES_ATUAL) || [];
  const salvosPorChave = new Map(salvos.map((p) => [chavePessoa(p), p]));
  $("#seg-lista").replaceChildren();

  COLABS.forEach((colab) => {
    const salvo = salvosPorChave.get(chavePessoa(colab));
    addSeg({ ...colab, valor: salvo?.valor || "", vr: salvo?.vr || "", va: salvo?.va || "" }, false, true);
  });
  salvos.filter((p) => p.manual).forEach((p) => addSeg(p, true, true));

  $("#busca-colab").value = "";
  FILTRO = "todos";
  document.querySelectorAll(".filter-option").forEach((button) => {
    button.classList.toggle("selected", button.dataset.filter === FILTRO);
  });
  atualizarResumoTS();
  recalcSoma(false);
  renderizarPendentes();
  msg(
    $("#seg-status"),
    `${COLABS.length} colaboradores carregados da TS para ${mesLabel(MES_ATUAL)}.`,
    "check"
  );
}

$("#mes").addEventListener("change", () => {
  const novoMes = $("#mes").value;
  if (!novoMes || novoMes === MES_ATUAL) return;
  const temValores = lerSegurados().length > 0;
  if (temValores && !window.confirm(
    `Trocar para ${mesLabel(novoMes)}? Os valores de ${mesLabel(MES_ATUAL)} ficarão salvos nesta sessão.`
  )) {
    $("#mes").value = MES_ATUAL;
    return;
  }
  salvarValoresMes();
  MES_ATUAL = novoMes;
  invalidarResultado();
  carregarColabs();
});

function addSeg(pessoa = null, manual = false, adiarAtualizacao = false) {
  const dados = pessoa && typeof pessoa === "object" ? pessoa : {};
  const colab = manual ? null : encontrarColab(dados);
  const nome = String(colab?.nome || dados.nome || "").trim();
  const id = String(colab?.id || dados.id || "").trim();

  const row = document.createElement("tr");
  row.className = "seg-row";
  row.dataset.id = id;
  row.dataset.nome = nome;
  row.dataset.manual = String(manual);
  row.dataset.search = C.norm(`${nome} ${id}`);

  const status = document.createElement("td");
  status.className = "status-col";
  status.innerHTML = '<span class="status-dot" title="Sem valor"></span>';

  const pessoaCell = document.createElement("td");
  if (manual) {
    const input = document.createElement("input");
    input.className = "seg-input";
    input.placeholder = `Nome do ${ROTULO()}`;
    input.autocomplete = "off";
    input.value = nome;
    input.setAttribute("aria-label", `Nome do ${ROTULO()}`);
    input.addEventListener("input", () => {
      row.dataset.nome = input.value.trim();
      row.dataset.search = C.norm(`${row.dataset.nome} ${row.dataset.id}`);
      revisarPessoas();
      aplicarFiltros();
      atualizarValidacao();
      invalidarResultado();
    });
    pessoaCell.appendChild(input);
  } else {
    const nomeEl = document.createElement("span");
    nomeEl.className = "person-name";
    nomeEl.textContent = nome;
    const idMobile = document.createElement("small");
    idMobile.className = "person-id-mobile";
    idMobile.textContent = id || "Sem ID";
    pessoaCell.append(nomeEl, idMobile);
  }

  const idCell = document.createElement("td");
  idCell.className = "id-col person-id";
  idCell.textContent = id || "—";

  const campoMoeda = (classe, coluna, inicial, rotulo) => {
    const cell = document.createElement("td");
    cell.className = `value-col ${coluna}`;
    const money = document.createElement("div");
    money.className = "money-field";
    money.innerHTML = "<span>R$</span>";
    const input = document.createElement("input");
    input.className = classe;
    input.inputMode = "decimal";
    input.placeholder = "0,00";
    input.value = typeof inicial === "string" ? inicial : valorMoeda(C.toFloat(inicial));
    input.setAttribute("aria-label", `${rotulo} de ${nome || ROTULO()}`);
    input.addEventListener("input", () => {
      atualizarLinha(row);
      recalcSoma();
    });
    input.addEventListener("blur", () => {
      input.value = valorMoeda(parseNum(input.value));
      atualizarLinha(row);
      recalcSoma(false);
    });
    money.appendChild(input);
    cell.appendChild(money);
    return cell;
  };
  const valorCell = campoMoeda("seg-valor", "nao-alim", dados.valor, "Valor");
  const vrCell = campoMoeda("seg-vr", "so-alim", dados.vr, "VR");
  const vaCell = campoMoeda("seg-va", "so-alim", dados.va, "VA");

  const actionCell = document.createElement("td");
  actionCell.className = "action-col";
  const action = document.createElement("button");
  action.className = "row-action";
  action.type = "button";
  action.title = manual ? "Remover pessoa" : "Limpar valor";
  action.setAttribute("aria-label", action.title);
  action.innerHTML = manual ? ICON.trash : ICON.close;
  action.addEventListener("click", () => {
    if (manual) row.remove();
    else row.querySelectorAll(".seg-valor, .seg-vr, .seg-va").forEach((input) => { input.value = ""; });
    recalcSoma();
  });
  actionCell.appendChild(action);

  row.append(status, pessoaCell, idCell, valorCell, vrCell, vaCell, actionCell);
  $("#seg-lista").appendChild(row);
  atualizarLinha(row);
  if (!adiarAtualizacao) recalcSoma();
  return row;
}

$("#btn-add-seg").addEventListener("click", () => {
  const row = addSeg(null, true);
  row.querySelector(".seg-input").focus();
});

function valoresLinha(row) {
  const ler = (classe) => row.querySelector(classe).value.trim();
  if (TIPO === "alimentacao") {
    const vr = parseNum(ler(".seg-vr"));
    const va = parseNum(ler(".seg-va"));
    return { vr, va, valor: vr + va, preenchido: !!(ler(".seg-vr") || ler(".seg-va")) };
  }
  const texto = ler(".seg-valor");
  return { valor: parseNum(texto), preenchido: !!texto };
}

function atualizarLinha(row) {
  const valor = valoresLinha(row).valor;
  const preenchido = valor !== 0;
  row.classList.toggle("has-value", preenchido);
  row.querySelector(".status-dot").title = preenchido ? "Com valor" : "Sem valor";
}

function lerSegurados() {
  const pessoas = [];
  document.querySelectorAll(".seg-row").forEach((row) => {
    const nome = row.dataset.manual === "true"
      ? row.querySelector(".seg-input").value.trim()
      : row.dataset.nome;
    const valores = valoresLinha(row);
    if (!nome || !valores.preenchido || valores.valor === 0) return;

    const id = row.dataset.id || "";
    const colab = COLAB_MAP.get(id) || COLAB_MAP.get(C.norm(nome));
    const { preenchido, ...numeros } = valores;
    pessoas.push(colab
      ? { id: colab.id, nome: colab.nome, ...numeros }
      : { id, nome, ...numeros });
  });
  return pessoas;
}

function revisarPessoas() {
  const contagem = new Map();
  document.querySelectorAll(".seg-row").forEach((row) => {
    const nome = row.dataset.manual === "true"
      ? row.querySelector(".seg-input").value.trim()
      : row.dataset.nome;
    const chave = row.dataset.id || C.norm(nome);
    if (chave) contagem.set(chave, (contagem.get(chave) || 0) + 1);
  });

  const duplicados = [];
  document.querySelectorAll(".seg-row").forEach((row) => {
    if (row.dataset.manual !== "true") return;
    const input = row.querySelector(".seg-input");
    const chave = row.dataset.id || C.norm(input.value);
    const duplicado = !!chave && contagem.get(chave) > 1;
    input.setAttribute("aria-invalid", String(duplicado));
    if (duplicado) duplicados.push(input.value.trim());
  });
  if (duplicados.length) {
    msg($("#seg-status"), `Pessoas repetidas: ${[...new Set(duplicados)].join(", ")}.`, "warn");
  }
}

function aplicarFiltros() {
  const busca = C.norm($("#busca-colab").value);
  let total = 0;
  let preenchidos = 0;
  let visiveis = 0;

  document.querySelectorAll(".seg-row").forEach((row) => {
    total++;
    const preenchido = row.classList.contains("has-value");
    if (preenchido) preenchidos++;
    const buscaOk = !busca || row.dataset.search.includes(busca);
    const filtroOk = FILTRO === "todos"
      || (FILTRO === "preenchidos" && preenchido)
      || (FILTRO === "pendentes" && !preenchido);
    row.hidden = !(buscaOk && filtroOk);
    if (!row.hidden) visiveis++;
  });

  $("#count-todos").textContent = total;
  $("#count-preenchidos").textContent = preenchidos;
  $("#count-pendentes").textContent = total - preenchidos;
  $("#table-empty").classList.toggle("hidden", visiveis > 0);
}

$("#busca-colab").addEventListener("input", aplicarFiltros);
document.querySelectorAll(".filter-option").forEach((button) => {
  button.addEventListener("click", () => {
    FILTRO = button.dataset.filter;
    document.querySelectorAll(".filter-option").forEach((b) => {
      b.classList.toggle("selected", b === button);
    });
    aplicarFiltros();
  });
});

function localizarLinha(chave) {
  const alvo = C.norm(chave);
  const idAlvo = normalizarId(chave);
  return [...document.querySelectorAll(".seg-row")].find((row) =>
    (row.dataset.id && normalizarId(row.dataset.id) === idAlvo)
    || C.norm(row.dataset.nome) === alvo
    || C.norm(`${row.dataset.nome} (${row.dataset.id})`) === alvo
  ) || null;
}

function aplicarPessoasImportadas(pessoas, origem, opcoes = {}) {
  const { silencioso = false, adicionarAusentes = false } =
    typeof opcoes === "boolean" ? { silencioso: opcoes } : opcoes;
  let preenchidos = 0;
  let adicionados = 0;
  const naoEncontrados = [];
  pessoas.forEach((pessoa) => {
    const colab = encontrarColab(pessoa);
    let row = localizarLinha(colab?.id || colab?.nome || pessoa.id || pessoa.nome);
    if (!row) {
      naoEncontrados.push(pessoa.nome || pessoa.id);
      if (!adicionarAusentes) return;
      row = addSeg({
        id: pessoa.id || "",
        nome: pessoa.nome || pessoa.id || "Titular do boleto",
        valor: pessoa.valor,
      }, true, true);
      adicionados++;
    }
    row.querySelector(".seg-valor").value = valorMoeda(C.toFloat(pessoa.valor));
    atualizarLinha(row);
    preenchidos++;
  });
  recalcSoma();
  const complemento = naoEncontrados.length ? ` ${naoEncontrados.length} não encontrados na TS.` : "";
  if (!silencioso) {
    msg($("#seg-status"), `${preenchidos} valores preenchidos por ${origem}.${complemento}`, naoEncontrados.length ? "warn" : "check");
  }
  return { preenchidos, adicionados, naoEncontrados };
}

async function obterLeitorPdf() {
  if (window.RateioPdf?.extrairTexto) return window.RateioPdf;
  if (window.RateioPdfErro) throw new Error(window.RateioPdfErro);
  await new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("O leitor de PDF não ficou disponível. Atualize a página e tente novamente.")),
      8000
    );
    window.addEventListener("rateio-pdf-ready", () => {
      window.clearTimeout(timer);
      resolve();
    }, { once: true });
  });
  if (!window.RateioPdf?.extrairTexto) {
    throw new Error(window.RateioPdfErro || "O leitor de PDF não pôde ser carregado.");
  }
  return window.RateioPdf;
}

function aplicarMesDoBoleto(mes) {
  if (!mes || !TS?.meses.includes(mes)) return false;
  if (MES_ATUAL !== mes) {
    salvarValoresMes();
    MES_ATUAL = mes;
    $("#mes").value = mes;
    invalidarResultado();
    carregarColabs();
  }
  return true;
}

function aplicarDadosBoleto(nomeArquivo, dados) {
  setTipo("saude");
  $("#seguradora").value = dados.seguradora || "";
  $("#codigo").value = dados.codigo_boleto || "";
  $("#valor_boleto").value = valorMoeda(dados.valor_boleto);

  const mesEncontrado = aplicarMesDoBoleto(dados.mes);
  const associacao = aplicarPessoasImportadas(dados.pessoas, "boleto PDF", {
    silencioso: true,
    adicionarAusentes: true,
  });
  const diferenca = dados.valor_boleto - dados.total_familias;

  $("#boleto-file-name").textContent = nomeArquivo;
  const quantidadeBoletos = dados.quantidade_boletos || 1;
  $("#boleto-file-meta").textContent = [
    quantidadeBoletos > 1 ? `${quantidadeBoletos} boletos consolidados` : "1 boleto",
    mesLabel(dados.mes),
    `${dados.pessoas.length} famílias`,
    dados.vencimento ? `vencimento ${dados.vencimento}` : "",
  ].filter(Boolean).join(" · ");
  $("#boleto-summary").classList.remove("hidden");

  const avisos = [];
  if (!mesEncontrado) {
    avisos.push(`A competência ${mesLabel(dados.mes)} não existe na planilha TS carregada.`);
  }
  if (associacao.adicionados) {
    avisos.push(associacao.adicionados === 1
      ? "1 titular não estava na TS e foi adicionado com seu valor; sem horas na TS, não influencia a distribuição por GP."
      : `${associacao.adicionados} titulares não estavam na TS e foram adicionados com seus valores; sem horas na TS, não influenciam a distribuição por GP.`
    );
  }
  if (Math.abs(diferenca) > 0.009) {
    avisos.push(`O boleto é ${fmtBRL(dados.valor_boleto)} e as famílias somam ${fmtBRL(dados.total_familias)}.`);
  }

  const resumoBoletos = quantidadeBoletos > 1 ? `${quantidadeBoletos} boletos processados. ` : "";
  const resumo = `${resumoBoletos}${associacao.preenchidos} de ${dados.pessoas.length} valores preenchidos automaticamente.`;
  msg(
    $("#boleto-status"),
    [resumo, ...avisos].join(" "),
    avisos.length ? "warn" : "check"
  );
  atualizarValidacao();
  return associacao;
}

async function importarBoletosPdf(files) {
  const selecionados = [...(files || [])];
  if (!selecionados.length) return;
  if (selecionados.some((file) => !/\.pdf$/i.test(file.name) && file.type !== "application/pdf")) {
    throw new Error("Selecione somente arquivos PDF.");
  }

  msg(
    $("#boleto-status"),
    selecionados.length === 1
      ? "Lendo o boleto e identificando as famílias..."
      : `Lendo ${selecionados.length} boletos e consolidando as famílias...`,
    "info"
  );
  const leitor = await obterLeitorPdf();
  const boletos = [];
  for (const file of selecionados) {
    const texto = await leitor.extrairTexto(file);
    boletos.push(C.parseBoletoPdfText(texto));
  }
  const dados = C.combinarBoletos(boletos);
  const nomeResumo = selecionados.length === 1
    ? selecionados[0].name
    : `${selecionados.length} boletos selecionados`;
  aplicarDadosBoleto(nomeResumo, dados);
}

$("#boleto-arquivo").addEventListener("change", async () => {
  const files = $("#boleto-arquivo").files;
  if (!files.length) return;
  setBusy($("#card-boleto"), null, true);
  try {
    await importarBoletosPdf(files);
  } catch (erro) {
    $("#boleto-summary").classList.add("hidden");
    msg($("#boleto-status"), erro.message || "Não foi possível ler os boletos.", "erro");
  } finally {
    $("#boleto-arquivo").value = "";
    setBusy($("#card-boleto"), null, false);
  }
});

$("#btn-trocar-boleto").addEventListener("click", () => {
  $("#boleto-arquivo").value = "";
  $("#boleto-arquivo").click();
});

$("#pessoas-arquivo").addEventListener("change", async () => {
  const file = $("#pessoas-arquivo").files[0];
  if (!file) return;
  try {
    const XLSX = exigirXLSX();
    msg($("#seg-status"), "Lendo os valores...", "info");
    const workbook = /\.csv$/i.test(file.name)
      ? XLSX.read(await file.text(), { type: "string", raw: true })
      : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const imp = C.carregarPessoas(workbook);
    aplicarPessoasImportadas(imp.pessoas, file.name);
  } catch (e) {
    msg($("#seg-status"), e.message || "Não foi possível importar os valores.", "erro");
  } finally {
    $("#pessoas-arquivo").value = "";
  }
});

function aplicarTextoColado(texto) {
  const itens = C.parsePessoasColadas(texto);
  if (!itens.length) {
    throw new Error("Não encontrei pares de colaborador e valor no conteúdo colado.");
  }
  aplicarPessoasImportadas(
    itens.map((item) => ({ id: item.chave, nome: item.chave, valor: item.valor })),
    "colagem"
  );
}

$("#btn-colar").addEventListener("click", async () => {
  try {
    if (!navigator.clipboard?.readText) throw new Error("A leitura da área de transferência não está disponível.");
    aplicarTextoColado(await navigator.clipboard.readText());
  } catch (e) {
    msg($("#seg-status"), e.message || "Não foi possível colar os valores.", "erro");
  }
});

$("#people-table-wrap").addEventListener("paste", (e) => {
  const texto = e.clipboardData?.getData("text");
  if (!texto || (!texto.includes("\t") && !texto.includes(";"))) return;
  e.preventDefault();
  try {
    aplicarTextoColado(texto);
  } catch (erro) {
    msg($("#seg-status"), erro.message, "erro");
  }
});

function setFieldState(id, invalido, mensagem, exibir) {
  const campo = $(id);
  if (!campo) return;
  campo.setAttribute("aria-invalid", String(invalido && exibir));
  const erro = $(`#erro-${campo.id}`);
  if (erro) erro.textContent = invalido && exibir ? mensagem : "";
}

function atualizarValidacao(exibir = false) {
  const pessoas = lerSegurados();
  let temNegativo = false;
  document.querySelectorAll(".seg-row").forEach((row) => {
    row.querySelectorAll(".seg-valor, .seg-vr, .seg-va").forEach((input) => {
      const negativo = parseNum(input.value) < 0;
      input.setAttribute("aria-invalid", String(negativo));
      temNegativo ||= negativo;
    });
  });
  const mesInvalido = !MES_ATUAL;
  const fornecedorInvalido = TIPO === "alimentacao" && !$("#fornecedor").value.trim();
  const seguradoraInvalida = TIPO === "saude" && !$("#seguradora").value.trim();
  const codigoInvalido = TIPO === "saude" && !$("#codigo").value.trim();
  const boletoInvalido = TIPO === "saude" && parseNum($("#valor_boleto").value) <= 0;

  setFieldState("#mes", mesInvalido, "Selecione o mês.", exibir || $("#mes").dataset.touched === "true");
  setFieldState("#seguradora", seguradoraInvalida, "Informe a seguradora.", exibir || $("#seguradora").dataset.touched === "true");
  setFieldState("#codigo", codigoInvalido, "Informe o código.", exibir || $("#codigo").dataset.touched === "true");
  setFieldState("#valor_boleto", boletoInvalido, "Informe um valor maior que zero.", exibir || $("#valor_boleto").dataset.touched === "true");
  setFieldState("#fornecedor", fornecedorInvalido, "Informe o fornecedor.", exibir || $("#fornecedor").dataset.touched === "true");

  const valido = !!TS
    && !mesInvalido
    && !seguradoraInvalida
    && !codigoInvalido
    && !boletoInvalido
    && !fornecedorInvalido
    && !temNegativo
    && pessoas.length > 0;
  $("#btn-calc").disabled = !valido;
  return valido;
}

["#seguradora", "#codigo", "#valor_boleto", "#fornecedor", "#lancamento", "#periodo"].forEach((id) => {
  $(id).addEventListener("input", () => {
    atualizarValidacao();
    invalidarResultado();
  });
  $(id).addEventListener("blur", () => {
    $(id).dataset.touched = "true";
    if (id === "#valor_boleto") {
      $("#valor_boleto").value = valorMoeda(parseNum($("#valor_boleto").value));
    }
    atualizarValidacao();
    recalcSoma(false);
  });
});

function recalcSoma(invalidar = true) {
  const pessoas = lerSegurados();
  const soma = pessoas.reduce((acc, pessoa) => acc + pessoa.valor, 0);
  const boleto = parseNum($("#valor_boleto").value);
  const diferenca = boleto - soma;

  $("#soma-seg").textContent = fmtBRL(soma);
  $("#soma-boleto").textContent = fmtBRL(boleto);
  $("#soma-dif").textContent = fmtBRL(diferenca);
  $("#active-count").textContent = `${pessoas.length} ${pessoas.length === 1 ? "participante" : "participantes"}`;
  const progresso = $("#amount-progress");
  progresso.value = boleto > 0 ? Math.min(100, Math.max(0, (soma / boleto) * 100)) : 0;
  progresso.title = boleto > 0
    ? `${Math.round((soma / boleto) * 100)}% do boleto informado`
    : "Aguardando o valor do boleto";

  const chip = $("#chip-dif");
  chip.classList.remove("exact", "mismatch");
  if (TIPO !== "ferias" && boleto > 0 && pessoas.length) {
    if (Math.abs(diferenca) < 0.01) {
      chip.classList.add("exact");
      $("#dif-status").textContent = "Valores conferem";
    } else {
      chip.classList.add("mismatch");
      $("#dif-status").textContent = diferenca > 0
        ? `Faltam ${fmtBRL(diferenca)}`
        : `Excede ${fmtBRL(Math.abs(diferenca))}`;
    }
  } else {
    $("#dif-status").textContent = TIPO === "alimentacao" && !boleto
      ? "Boleto opcional"
      : "Aguardando valores";
  }

  document.querySelectorAll(".seg-row").forEach(atualizarLinha);
  revisarPessoas();
  aplicarFiltros();
  atualizarValidacao();
  if (invalidar) invalidarResultado();
}

$("#btn-calc").addEventListener("click", () => {
  const st = $("#calc-status");
  if (!atualizarValidacao(true)) {
    msg(st, `Preencha os dados obrigatórios e o valor de pelo menos um ${ROTULO()}.`, "erro");
    return;
  }

  const pessoas = lerSegurados();
  let resultado;
  let extra;

  if (TIPO === "alimentacao") {
    const entrada = {
      mes: MES_ATUAL,
      fornecedor: $("#fornecedor").value.trim(),
      valor_boleto: parseNum($("#valor_boleto").value) || "",
      funcionarios: pessoas,
    };
    const validacao = C.validarAlimentacao(entrada);
    if (!validacao.ok) {
      msgs(st, validacao.erros, "erro");
      return;
    }
    resultado = C.calcularAlimentacao(TS, MES_ATUAL, pessoas, entrada.valor_boleto);
    extra = {
      fornecedor: entrada.fornecedor,
      lancamento: $("#lancamento").value.trim(),
      periodo: $("#periodo").value.trim(),
    };
  } else if (TIPO === "ferias") {
    const validacao = C.validarFerias({ mes: MES_ATUAL, funcionarios: pessoas });
    if (!validacao.ok) {
      msgs(st, validacao.erros, "erro");
      return;
    }
    resultado = C.calcularFerias(TS, MES_ATUAL, pessoas);
    extra = {};
  } else {
    const entrada = {
      mes: MES_ATUAL,
      seguradora: $("#seguradora").value.trim(),
      codigo_boleto: $("#codigo").value.trim(),
      valor_boleto: parseNum($("#valor_boleto").value),
      segurados: pessoas,
    };
    const validacao = C.validarEntrada(entrada);
    if (!validacao.ok) {
      msgs(st, validacao.erros, "erro");
      return;
    }
    resultado = C.calcularPlanoSaude(TS, MES_ATUAL, pessoas, entrada.valor_boleto);
    extra = { seguradora: entrada.seguradora, codigo_boleto: entrada.codigo_boleto };
  }

  if (!resultado.tabela_final.length) {
    msg(
      st,
      `Nenhuma hora encontrada na TS para os ${ROTULO()}s selecionados. ` +
      "Eles serão incluídos no Excel com o status \"Sem horas na TS\".",
      "warn"
    );
  } else {
    msg(st, "", "");
  }

  salvarValoresMes();
  ULTIMO = { res: resultado, extra };
  mostrarResultado(resultado);
});

function mostrarResultado(dados) {
  const saude = dados.tipo === "plano_saude";
  const alim = dados.tipo === "alimentacao";
  const qtdPessoas = saude ? dados.qtd_segurados : dados.qtd_funcionarios;
  const totalFinal = dados.tabela_final.reduce((acc, row) => acc + row.valor_final, 0);

  $("#result-total").textContent = fmtBRL(totalFinal);
  $("#result-gps").textContent = dados.qtd_gps;
  $("#result-pessoas").textContent = qtdPessoas;
  $("#result-pessoas-label").textContent = saude ? "Segurados" : "Funcionários";

  const avisos = [];
  if (dados.sem_horas.length) {
    avisos.push(
      `Sem horas na TS e não rateados, mas incluídos no Excel: ${dados.sem_horas.join(", ")}.`
    );
  }
  if (dados.proporcao_suspeita?.length) {
    avisos.push(
      "Proporções fora de 100%: " +
      dados.proporcao_suspeita.map((x) =>
        `${x.nome} (${(x.soma * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)`
      ).join(", ") + "."
    );
  }
  if (alim && dados.valor_boleto !== null && Math.abs(dados.diferenca_boleto) > 0.009) {
    avisos.push(
      `Boleto (${fmtBRL(dados.valor_boleto)}) e soma do pedido (${fmtBRL(dados.total_alimentacao)}) ` +
      `diferem em ${fmtBRL(dados.diferenca_boleto)}. Confira se faltou alguma quinzena ou funcionário.`
    );
  }
  if (alim && PENDENTES.length) {
    avisos.push(
      `${PENDENTES.length} nome(s) do pedido sem colaborador escolhido ficaram fora do rateio: ` +
      PENDENTES.map((p) => p.nome).join(", ") + "."
    );
  }
  if (saude && Math.abs(dados.diferenca_boleto_segurados) > 0.009) {
    avisos.push(
      `Boleto e soma dos segurados diferem em ${fmtBRL(dados.diferenca_boleto_segurados)}. ` +
      "O valor final foi ajustado ao boleto."
    );
  }

  $("#result-alerts").classList.toggle("hidden", avisos.length === 0);
  $("#result-alert-count").textContent = avisos.length;
  msgs($("#result-msgs"), avisos, "warn");

  const moeda = (v) => `<td class="num">${esc(fmtBRL(v))}</td>`;
  const total = { horas: 0, vr: 0, va: 0, valor: 0, proporcao: 0, valor_final: 0 };
  RESULT_ROWS = dados.tabela_final.map((row) => {
    Object.keys(total).forEach((k) => { total[k] += row[k] || 0; });
    return {
      gp: String(row.gp),
      html: `<tr data-gp="${esc(C.norm(row.gp))}">
        <td>${esc(row.gp)}</td>
        <td class="num">${esc(fmtNum(row.horas))}</td>
        ${alim ? moeda(row.vr) + moeda(row.va) : ""}
        ${moeda(row.valor)}
        <td class="num">${esc(fmtPct(row.proporcao))}</td>
        ${moeda(row.valor_final)}
      </tr>`,
    };
  });

  const cabExtra = alim ? "<th>VR</th><th>VA</th>" : "";
  $("#tabela-final").innerHTML =
    `<thead><tr><th>GP</th><th>Horas</th>${cabExtra}<th>Valor</th><th>Proporção</th><th>Valor final</th></tr></thead>
     <tbody>${RESULT_ROWS.map((row) => row.html).join("")}</tbody>
     <tfoot><tr><td>TOTAL</td><td class="num">${esc(fmtNum(total.horas))}</td>
       ${alim ? moeda(total.vr) + moeda(total.va) : ""}
       ${moeda(total.valor)}<td class="num">${esc(fmtPct(total.proporcao))}</td>
       ${moeda(total.valor_final)}</tr></tfoot>`;

  $("#busca-gp").value = "";
  $("#result-empty").classList.toggle("hidden", RESULT_ROWS.length > 0);
  $("#card-result").classList.remove("hidden");
  setStep(4);
  $("#card-result").scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#busca-gp").addEventListener("input", () => {
  const busca = C.norm($("#busca-gp").value);
  let visiveis = 0;
  $("#tabela-final").querySelectorAll("tbody tr").forEach((row) => {
    row.hidden = !!busca && !row.dataset.gp.includes(busca);
    if (!row.hidden) visiveis++;
  });
  $("#result-empty").classList.toggle("hidden", visiveis > 0);
});

$("#btn-edit").addEventListener("click", () => {
  $("#card-seg").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("#btn-download").addEventListener("click", () => {
  if (!ULTIMO) return;
  const exportacao = C.prepararExport(ULTIMO.res, ULTIMO.extra);
  const workbook = C.montarWorkbook(ULTIMO.res, exportacao);
  C.XLSX.writeFile(workbook, exportacao.nomeArquivo);
});

// ---- Alimentação: pedido de recarga (VR/VA) ----
// Escolhas manuais "nome no pedido -> colaborador da TS" ficam salvas neste navegador.
const APELIDOS_KEY = "rateio.alimentacao.apelidos";

function lerApelidos() {
  try {
    return JSON.parse(localStorage.getItem(APELIDOS_KEY) || "{}") || {};
  } catch (e) {
    return {};
  }
}

function salvarApelido(nomePedido, colab) {
  try {
    const apelidos = lerApelidos();
    apelidos[C.norm(nomePedido)] = colab.id || colab.nome;
    localStorage.setItem(APELIDOS_KEY, JSON.stringify(apelidos));
  } catch (e) {
    /* armazenamento indisponível: segue sem memorizar */
  }
}

// A planilha de CONTROLE traz o Id do colaborador: ele vale mais que qualquer semelhança de nome.
function casarPedido(item) {
  const nome = typeof item === "string" ? item : (item.nome || "");
  const id = typeof item === "string" ? "" : (item.id || "");
  if (id) {
    const alvo = normalizarId(id);
    const porId = COLABS.find((c) => c.id && normalizarId(c.id) === alvo);
    if (porId) return { colab: porId, candidatos: [] };
  }
  const salvo = lerApelidos()[C.norm(nome)];
  const porApelido = salvo && COLABS.find((c) => (c.id || c.nome) === salvo);
  if (porApelido) return { colab: porApelido, candidatos: [] };
  return C.casarNome(nome, COLABS);
}

function preencherPedido(row, item) {
  const vr = row.querySelector(".seg-vr");
  const va = row.querySelector(".seg-va");
  vr.value = valorMoeda(C.round(parseNum(vr.value) + item.vr, 2));
  va.value = valorMoeda(C.round(parseNum(va.value) + item.va, 2));
  atualizarLinha(row);
}

function abrirPainelPedido(nomeArquivo, html, ajuda, comBusca) {
  $("#pedido-blocos").innerHTML = html;
  $("#pedido-file-name").textContent = nomeArquivo;
  $("#pedido-ajuda").textContent = ajuda;
  $("#pedido-busca").value = "";
  $("#pedido-busca-wrap").classList.toggle("hidden", !comBusca);
  $("#pedido-panel").classList.remove("hidden");
}

function renderizarBlocos(nomeArquivo) {
  const item = (bloco) =>
    `<label class="bloco"><input type="checkbox" value="${BLOCOS.indexOf(bloco)}" />` +
    `<span class="b-tit">${esc(bloco.titulo || bloco.aba)}` +
    `<small>Aba “${esc(bloco.aba)}” · ${bloco.itens.length} funcionário(s)</small></span>` +
    `<span class="b-val num">${esc(fmtBRL(bloco.total))}` +
    `<small>VR ${esc(fmtBRL(bloco.total_vr))} · VA ${esc(fmtBRL(bloco.total_va))}</small></span></label>`;
  const avulsos = BLOCOS.filter((b) => b.avulso);
  let html = BLOCOS.filter((b) => !b.avulso).map(item).join("");
  if (avulsos.length) {
    html += `<details><summary>Pedidos avulsos (${avulsos.length})</summary>${avulsos.map(item).join("")}</details>`;
  }
  abrirPainelPedido(nomeArquivo, html, "Marque a(s) quinzena(s) deste lançamento. Saldo livre entra como VA.", false);
}

function renderizarLancamentos(nomeArquivo) {
  const html = LANCAMENTOS.map((l, i) => {
    const alertas = [];
    if (l.sem_controle) alertas.push("sem linha na aba CONTROLE");
    else if (Math.abs(l.diferenca) > 0.009) alertas.push(`boleto difere da soma em ${fmtBRL(l.diferenca)}`);
    if (!l.mes_key) alertas.push("sem competência");
    const detalhe = [
      l.periodo, l.mes_key ? `competência ${mesLabel(l.mes_key)}` : "", `${l.itens.length} funcionário(s)`,
    ].filter(Boolean).join(" · ");
    const busca = C.norm([l.numero, l.fornecedor, l.tipo, l.periodo, mesLabel(l.mes_key || ""), l.obs].join(" "));
    return `<label class="bloco${alertas.length ? " alerta" : ""}" data-busca="${esc(busca)}">` +
      `<input type="checkbox" value="${i}" />` +
      `<span class="b-num num">${esc(l.numero)}</span>` +
      `<span class="b-tit">${esc(l.fornecedor)}${l.tipo ? ` · ${esc(l.tipo)}` : ""}` +
      `<small>${esc(detalhe)}${alertas.length ? ` <span class="aviso">· ${esc(alertas.join(" · "))}</span>` : ""}</small></span>` +
      `<span class="b-val num">${esc(l.valor_boleto ? fmtBRL(l.valor_boleto) : fmtBRL(l.total))}` +
      `<small>VR ${esc(fmtBRL(l.total_vr))} · VA ${esc(fmtBRL(l.total_va))}</small></span></label>`;
  }).join("");
  abrirPainelPedido(nomeArquivo, html,
    `${LANCAMENTOS.length} lançamento(s) encontrados. Marque o boleto que quer ratear (o mais recente vem primeiro).`, true);
}

$("#pedido-busca").addEventListener("input", () => {
  const busca = C.norm($("#pedido-busca").value);
  $("#pedido-blocos").querySelectorAll(".bloco").forEach((el) => {
    el.hidden = !!busca && !(el.dataset.busca || "").includes(busca);
  });
});

function renderizarPendentes() {
  const box = $("#pedido-pendentes");
  box.classList.toggle("hidden", PENDENTES.length === 0);
  box.replaceChildren();
  if (!PENDENTES.length) return;

  const titulo = document.createElement("h3");
  titulo.textContent = `${PENDENTES.length} nome(s) do pedido sem colaborador`;
  const ajuda = document.createElement("p");
  ajuda.textContent = "Escolha o colaborador da TS correspondente. A escolha fica salva neste navegador.";
  box.append(titulo, ajuda);

  PENDENTES.forEach((pendente) => {
    const linha = document.createElement("div");
    linha.className = "pendente";
    const nome = document.createElement("span");
    nome.innerHTML = `<strong>${esc(pendente.nome)}</strong>`;
    const dica = document.createElement("small");
    const candidatos = C.casarNome(pendente.nome || "", COLABS).candidatos;
    dica.textContent = candidatos.length
      ? `Possíveis: ${candidatos.map((c) => c.nome).join(", ")}`
      : "Nenhum nome parecido na TS deste mês";
    nome.appendChild(dica);

    const select = document.createElement("select");
    select.setAttribute("aria-label", `Colaborador da TS para ${pendente.nome}`);
    const chaves = new Set(candidatos.map(chavePessoa));
    const opcao = (c) => `<option value="${esc(chavePessoa(c))}">${esc(displayColab(c))}</option>`;
    select.innerHTML = '<option value="">Escolher colaborador…</option>' +
      (candidatos.length ? `<optgroup label="Sugestões">${candidatos.map(opcao).join("")}</optgroup>` : "") +
      `<optgroup label="Todos">${COLABS.filter((c) => !chaves.has(chavePessoa(c))).map(opcao).join("")}</optgroup>`;
    select.addEventListener("change", () => {
      const colab = COLAB_MAP.get(select.value);
      const row = colab && localizarLinha(colab.id || colab.nome);
      if (!row) return;
      salvarApelido(pendente.nome, colab);
      preencherPedido(row, pendente);
      PENDENTES = PENDENTES.filter((p) => p !== pendente);
      renderizarPendentes();
      recalcSoma();
      if (!PENDENTES.length) {
        msg($("#pedido-status"), "Todos os nomes do pedido foram associados a colaboradores da TS.", "check");
      }
    });

    const valor = document.createElement("span");
    valor.className = "b-val num";
    valor.textContent = `VR ${fmtBRL(pendente.vr)} · VA ${fmtBRL(pendente.va)}`;
    linha.append(nome, select, valor);
    box.appendChild(linha);
  });
}

$("#arquivo-pedido").addEventListener("change", async () => {
  const file = $("#arquivo-pedido").files[0];
  if (!file) return;
  try {
    const XLSX = exigirXLSX();
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const lido = C.lerArquivoAlimentacao(workbook);
    IMPORT_TIPO = lido.tipo;
    BLOCOS = lido.blocos || [];
    LANCAMENTOS = lido.lancamentos || [];
    if (IMPORT_TIPO === "controle") renderizarLancamentos(file.name);
    else renderizarBlocos(file.name);
    msg($("#pedido-status"), "", "");
  } catch (e) {
    BLOCOS = []; LANCAMENTOS = []; IMPORT_TIPO = "";
    $("#pedido-panel").classList.add("hidden");
    msg($("#pedido-status"), e.message || "Não foi possível ler a planilha.", "erro");
  } finally {
    $("#arquivo-pedido").value = "";
  }
});

// Preenche os campos do lançamento (fornecedor, nº, período, competência e valor do boleto).
function aplicarDadosLancamento(lancs) {
  const avisos = [];
  const fornecedores = [...new Set(lancs.map((l) => l.fornecedor).filter(Boolean))];
  if (fornecedores.length === 1) $("#fornecedor").value = fornecedores[0];
  else if (fornecedores.length > 1) avisos.push(`Fornecedores diferentes no mesmo rateio: ${fornecedores.join(", ")}.`);
  $("#lancamento").value = lancs.map((l) => l.numero).join(", ");
  const periodos = [...new Set(lancs.map((l) => l.periodo).filter(Boolean))];
  if (periodos.length) $("#periodo").value = periodos.join(" / ");

  const meses = [...new Set(lancs.map((l) => l.mes_key).filter(Boolean))];
  if (meses.length > 1) {
    avisos.push(`Competências diferentes: ${meses.map(mesLabel).join(", ")}. Confira o mês selecionado.`);
  } else if (meses.length === 1 && meses[0] !== MES_ATUAL) {
    if (!aplicarMesDoBoleto(meses[0])) {
      avisos.push(`A competência ${mesLabel(meses[0])} do lançamento não existe na TS carregada.`);
    }
  }

  const boleto = C.round(lancs.reduce((acc, l) => acc + (l.valor_boleto || 0), 0), 2);
  if (boleto > 0) {
    $("#valor_boleto").value = valorMoeda(boleto);
  } else {
    avisos.push("Lançamento sem valor na aba CONTROLE: confirme o valor do boleto.");
  }
  lancs.filter((l) => !l.sem_controle && Math.abs(l.diferenca) > 0.009).forEach((l) => {
    avisos.push(`No lançamento ${l.numero} o boleto (${fmtBRL(l.valor_boleto)}) difere da soma das pessoas (${fmtBRL(l.total)}).`);
  });
  return avisos;
}

$("#btn-aplicar-pedido").addEventListener("click", () => {
  const controle = IMPORT_TIPO === "controle";
  const fonte = controle ? LANCAMENTOS : BLOCOS;
  const selecionados = [...document.querySelectorAll("#pedido-blocos input:checked")]
    .map((input) => fonte[Number(input.value)]).filter(Boolean);
  if (!selecionados.length) {
    msg($("#pedido-status"), controle ? "Marque ao menos um lançamento." : "Marque ao menos uma quinzena.", "erro");
    return;
  }

  // a competência pode trocar o mês (e recriar as linhas): aplicar os dados antes de preencher
  const avisos = controle ? aplicarDadosLancamento(selecionados) : [];
  const itens = C.juntarPedido(selecionados);
  document.querySelectorAll(".seg-row").forEach((row) => {
    row.querySelector(".seg-vr").value = "";
    row.querySelector(".seg-va").value = "";
  });
  PENDENTES = [];
  let preenchidos = 0;
  itens.forEach((item) => {
    const { colab } = casarPedido(item);
    const row = colab && localizarLinha(colab.id || colab.nome);
    if (row) {
      preencherPedido(row, item);
      preenchidos++;
    } else {
      PENDENTES.push(item);
    }
  });
  if (!controle && selecionados.length === 1 && !$("#periodo").value.trim()) {
    $("#periodo").value = selecionados[0].titulo || "";
  }
  $("#pedido-panel").classList.add("hidden");
  renderizarPendentes();
  recalcSoma();
  atualizarValidacao();
  const total = itens.reduce((acc, item) => acc + item.vr + item.va, 0);
  const origem = controle
    ? `Lançamento(s) ${selecionados.map((l) => l.numero).join(", ")}`
    : $("#pedido-file-name").textContent;
  msg(
    $("#pedido-status"),
    [`${origem}: ${preenchidos} de ${itens.length} funcionários preenchidos (total ${fmtBRL(total)}).`,
      PENDENTES.length ? `Escolha o colaborador dos ${PENDENTES.length} nome(s) abaixo.` : "",
      ...avisos].filter(Boolean).join(" "),
    PENDENTES.length || avisos.length ? "warn" : "check"
  );
});

if (!C || !C.XLSX || typeof C.XLSX.read !== "function") {
  msg(
    $("#ts-status"),
    "A biblioteca de planilhas não foi carregada. Atualize a página e tente novamente.",
    "erro"
  );
}

setTipo("saude");
setStep(1);
