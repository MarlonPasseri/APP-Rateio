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
const ROTULO = () => (TIPO === "ferias" ? "funcionário" : "segurado");
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
    box.innerHTML = ICON[tipo] || ICON.info;
    const conteudo = document.createElement("div");
    conteudo.textContent = texto;
    box.appendChild(conteudo);
    el.appendChild(box);
  });
}

function setStep(n) {
  document.querySelectorAll(".stp").forEach((step) => {
    const i = Number(step.dataset.stp);
    step.classList.toggle("done", i < n);
    step.classList.toggle("active", i === n);
    step.querySelector(".dot").innerHTML = i < n ? ICON.check : String(i);
  });
}

function invalidarResultado() {
  if (!ULTIMO) return;
  ULTIMO = null;
  RESULT_ROWS = [];
  $("#card-result").classList.add("hidden");
  setStep(TS ? 3 : 2);
}

function setTipo(tipo) {
  if (tipo !== "saude" && tipo !== "ferias") return;
  if (TIPO !== tipo) invalidarResultado();
  TIPO = tipo;
  const ferias = tipo === "ferias";

  document.body.classList.toggle("modo-ferias", ferias);
  document.querySelectorAll(".type-option[data-tipo]").forEach((button) => {
    const ativo = button.dataset.tipo === tipo;
    button.classList.toggle("selected", ativo);
    button.setAttribute("aria-pressed", String(ativo));
  });

  $("#titulo-dados").textContent = ferias ? "Dados das férias" : "Dados do boleto";
  $("#sub-dados").textContent = ferias ? "Mês de referência do pagamento" : "Identificação e valor total";
  $("#titulo-seg").textContent = ferias ? "Funcionários e valores de férias" : "Segurados e valores";
  $("#sub-seg").textContent = ferias
    ? "Informe o valor das férias de quem participa"
    : "Informe o valor do plano de quem participa";
  $("#lbl-soma").textContent = ferias ? "Soma das férias" : "Soma dos segurados";
  $("#result-pessoas-label").textContent = ferias ? "Funcionários" : "Segurados";
  $("#header-tipo").textContent = ferias ? "Férias" : "Plano de Saúde";
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
  $("#btn-upload").disabled = true;
  try {
    const XLSX = exigirXLSX();
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const novaTS = C.carregarTS(workbook);
    ativarTS(novaTS, file.name);
    $("#workspace").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    msg($("#ts-status"), e.message || "Não foi possível ler a planilha.", "erro");
  } finally {
    $("#btn-upload").disabled = false;
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
  const id = normalizarId(pessoa.id);
  const nome = C.norm(pessoa.nome || "");
  return COLABS.find((c) => id && normalizarId(c.id) === id)
    || COLABS.find((c) => C.norm(c.nome || "") === nome)
    || null;
}

function salvarValoresMes() {
  if (!MES_ATUAL) return;
  const valores = [];
  document.querySelectorAll(".seg-row").forEach((row) => {
    const nome = row.dataset.manual === "true"
      ? row.querySelector(".seg-input").value.trim()
      : row.dataset.nome;
    const valor = row.querySelector(".seg-valor").value.trim();
    if (nome || valor) {
      valores.push({
        id: row.dataset.id || "",
        nome,
        valor,
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
    addSeg({ ...colab, valor: salvo?.valor || "" }, false, true);
  });
  salvos.filter((p) => p.manual).forEach((p) => addSeg(p, true, true));

  $("#busca-colab").value = "";
  FILTRO = "todos";
  document.querySelectorAll(".filter-option").forEach((button) => {
    button.classList.toggle("selected", button.dataset.filter === FILTRO);
  });
  atualizarResumoTS();
  recalcSoma(false);
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

  const valorCell = document.createElement("td");
  valorCell.className = "value-col";
  const money = document.createElement("div");
  money.className = "money-field";
  money.innerHTML = "<span>R$</span>";
  const valor = document.createElement("input");
  valor.className = "seg-valor";
  valor.inputMode = "decimal";
  valor.placeholder = "0,00";
  valor.value = typeof dados.valor === "string"
    ? dados.valor
    : valorMoeda(C.toFloat(dados.valor));
  valor.setAttribute("aria-label", `Valor de ${nome || ROTULO()}`);
  valor.addEventListener("input", () => {
    atualizarLinha(row);
    recalcSoma();
  });
  valor.addEventListener("blur", () => {
    valor.value = valorMoeda(parseNum(valor.value));
    atualizarLinha(row);
    recalcSoma(false);
  });
  money.appendChild(valor);
  valorCell.appendChild(money);

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
    else valor.value = "";
    recalcSoma();
  });
  actionCell.appendChild(action);

  row.append(status, pessoaCell, idCell, valorCell, actionCell);
  $("#seg-lista").appendChild(row);
  atualizarLinha(row);
  if (!adiarAtualizacao) recalcSoma();
  return row;
}

$("#btn-add-seg").addEventListener("click", () => {
  const row = addSeg(null, true);
  row.querySelector(".seg-input").focus();
});

function atualizarLinha(row) {
  const valor = parseNum(row.querySelector(".seg-valor").value);
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
    const valorTxt = row.querySelector(".seg-valor").value.trim();
    const valor = parseNum(valorTxt);
    if (!nome || !valorTxt || valor === 0) return;

    const id = row.dataset.id || "";
    const colab = COLAB_MAP.get(id) || COLAB_MAP.get(C.norm(nome));
    pessoas.push(colab
      ? { id: colab.id, nome: colab.nome, valor }
      : { id, nome, valor });
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
  try {
    await importarBoletosPdf(files);
  } catch (erro) {
    $("#boleto-summary").classList.add("hidden");
    msg($("#boleto-status"), erro.message || "Não foi possível ler os boletos.", "erro");
  } finally {
    $("#boleto-arquivo").value = "";
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
    const input = row.querySelector(".seg-valor");
    const negativo = parseNum(input.value) < 0;
    input.setAttribute("aria-invalid", String(negativo));
    temNegativo ||= negativo;
  });
  const mesInvalido = !MES_ATUAL;
  const seguradoraInvalida = TIPO === "saude" && !$("#seguradora").value.trim();
  const codigoInvalido = TIPO === "saude" && !$("#codigo").value.trim();
  const boletoInvalido = TIPO === "saude" && parseNum($("#valor_boleto").value) <= 0;

  setFieldState("#mes", mesInvalido, "Selecione o mês.", exibir || $("#mes").dataset.touched === "true");
  setFieldState("#seguradora", seguradoraInvalida, "Informe a seguradora.", exibir || $("#seguradora").dataset.touched === "true");
  setFieldState("#codigo", codigoInvalido, "Informe o código.", exibir || $("#codigo").dataset.touched === "true");
  setFieldState("#valor_boleto", boletoInvalido, "Informe um valor maior que zero.", exibir || $("#valor_boleto").dataset.touched === "true");

  const valido = !!TS
    && !mesInvalido
    && !seguradoraInvalida
    && !codigoInvalido
    && !boletoInvalido
    && !temNegativo
    && pessoas.length > 0;
  $("#btn-calc").disabled = !valido;
  return valido;
}

["#seguradora", "#codigo", "#valor_boleto"].forEach((id) => {
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

  const chip = $("#chip-dif");
  chip.classList.remove("exact", "mismatch");
  if (TIPO === "saude" && boleto > 0 && pessoas.length) {
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
    $("#dif-status").textContent = "Aguardando valores";
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

  if (TIPO === "ferias") {
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
    msg(st, `Nenhuma hora encontrada na TS para os ${ROTULO()}s selecionados.`, "erro");
    return;
  }

  msg(st, "", "");
  salvarValoresMes();
  ULTIMO = { res: resultado, extra };
  mostrarResultado(resultado);
});

function mostrarResultado(dados) {
  const ferias = dados.tipo === "ferias";
  const qtdPessoas = ferias ? dados.qtd_funcionarios : dados.qtd_segurados;
  const totalFinal = dados.tabela_final.reduce((acc, row) => acc + row.valor_final, 0);

  $("#result-total").textContent = fmtBRL(totalFinal);
  $("#result-gps").textContent = dados.qtd_gps;
  $("#result-pessoas").textContent = qtdPessoas;
  $("#result-pessoas-label").textContent = ferias ? "Funcionários" : "Segurados";

  const avisos = [];
  if (dados.sem_horas.length) {
    avisos.push(`Sem horas na TS e não rateados: ${dados.sem_horas.join(", ")}.`);
  }
  if (dados.proporcao_suspeita?.length) {
    avisos.push(
      "Proporções fora de 100%: " +
      dados.proporcao_suspeita.map((x) =>
        `${x.nome} (${(x.soma * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)`
      ).join(", ") + "."
    );
  }
  if (!ferias && Math.abs(dados.diferenca_boleto_segurados) > 0.009) {
    avisos.push(
      `Boleto e soma dos segurados diferem em ${fmtBRL(dados.diferenca_boleto_segurados)}. ` +
      "O valor final foi ajustado ao boleto."
    );
  }

  $("#result-alerts").classList.toggle("hidden", avisos.length === 0);
  $("#result-alert-count").textContent = avisos.length;
  msgs($("#result-msgs"), avisos, "warn");

  let totalHoras = 0;
  let totalValor = 0;
  let totalProporcao = 0;
  let totalRateado = 0;
  RESULT_ROWS = dados.tabela_final.map((row) => {
    totalHoras += row.horas;
    totalValor += row.valor;
    totalProporcao += row.proporcao;
    totalRateado += row.valor_final;
    return {
      gp: String(row.gp),
      html: `<tr data-gp="${esc(C.norm(row.gp))}">
        <td>${esc(row.gp)}</td>
        <td class="num">${esc(fmtNum(row.horas))}</td>
        <td class="num">${esc(fmtBRL(row.valor))}</td>
        <td class="num">${esc(fmtPct(row.proporcao))}</td>
        <td class="num">${esc(fmtBRL(row.valor_final))}</td>
      </tr>`,
    };
  });

  $("#tabela-final").innerHTML =
    `<thead><tr><th>GP</th><th>Horas</th><th>Valor</th><th>Proporção</th><th>Valor final</th></tr></thead>
     <tbody>${RESULT_ROWS.map((row) => row.html).join("")}</tbody>
     <tfoot><tr><td>TOTAL</td><td class="num">${esc(fmtNum(totalHoras))}</td>
       <td class="num">${esc(fmtBRL(totalValor))}</td><td class="num">${esc(fmtPct(totalProporcao))}</td>
       <td class="num">${esc(fmtBRL(totalRateado))}</td></tr></tfoot>`;

  $("#busca-gp").value = "";
  $("#result-empty").classList.add("hidden");
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

if (!C || !C.XLSX || typeof C.XLSX.read !== "function") {
  msg(
    $("#ts-status"),
    "A biblioteca de planilhas não foi carregada. Atualize a página e tente novamente.",
    "erro"
  );
}

setTipo("saude");
setStep(1);
