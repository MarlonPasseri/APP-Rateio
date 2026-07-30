/* Núcleo de cálculo do Rateio por GP — domínio puro + leitura/escrita de .xlsx.
 *
 * Arquitetura: este módulo NÃO conhece o DOM. Toda a lógica testável vive aqui.
 * A interface (app.js) e os testes (tests/) consomem a API exportada abaixo.
 *
 * UMD: no navegador expõe `window.RateioCore` (usando o XLSX global já carregado);
 * no Node é importável via `require('./core.js')` (carrega o SheetJS vendorizado).
 */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./vendor/xlsx.full.min.js"));
  } else {
    root.RateioCore = factory(root.XLSX);
  }
})(typeof self !== "undefined" ? self : this, function (XLSX) {
  "use strict";

  // ---- Configuração de colunas da planilha TS ----
  const COLUNAS = {
    id: ["id colaborador", "id do colaborador", "id colab", "matricula"],
    nome: ["nome colaborador", "nome do colaborador", "colaborador", "nome"],
    mes: ["mes", "mes referencia", "competencia", "mes/ano"],
    gp: ["gp", "centro de custo", "cc", "numero gp"],
    horas: ["horas trabalhadas", "horas trab", "horas"],
    proporcao: ["proporcao de hora", "proporcao da hora", "proporcao das horas", "proporcao"],
  };
  const OBRIGATORIAS = ["nome", "mes", "gp", "horas", "proporcao"];
  const COLUNAS_PESSOAS = {
    id: ["id colaborador", "id do colaborador", "id colab", "matricula", "id"],
    nome: ["nome colaborador", "nome do colaborador", "colaborador", "funcionario", "segurado", "nome"],
    valor: ["valor", "valor segurado", "valor funcionario", "valor ferias", "valor plano", "mensalidade"],
  };

  // ---- Utilitários puros ----
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
    if (typeof v === "number") return isFinite(v) ? v : 0;
    let s = String(v).trim().replace(/R\$/g, "").replace(/\s/g, "");
    if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
    else if (s.includes(",")) s = s.replace(",", ".");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function round(n, d) {
    const f = 10 ** d;
    return Math.round((n + Number.EPSILON) * f) / f;
  }

  function sanitizar(s) {
    return String(s).replace(/[\\/:*?"<>|]+/g, "_").trim();
  }

  function nomeArquivoSaida(mk, seguradora, codigo) {
    const [ano, mes] = mk.split("-");
    return `${ano.slice(2)}-${mes}-${sanitizar(seguradora)}-${sanitizar(codigo)}.xlsx`;
  }

  // ---- Leitura da planilha TS ----
  function carregarTS(workbook) {
    if (!workbook || !Array.isArray(workbook.SheetNames)) {
      throw new Error("Arquivo inválido ou não é uma planilha.");
    }
    for (const nomeAba of workbook.SheetNames) {
      const ws = workbook.Sheets[nomeAba];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
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

  // ---- Leitura de uma lista simples de pessoas/valores para preencher a UI ----
  function carregarPessoas(workbook) {
    if (!workbook || !Array.isArray(workbook.SheetNames)) {
      throw new Error("Arquivo inválido ou não é uma planilha/lista.");
    }
    for (const nomeAba of workbook.SheetNames) {
      const ws = workbook.Sheets[nomeAba];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
      let linhaCab = -1, mapa = null;
      for (let i = 0; i < Math.min(10, aoa.length); i++) {
        const normalizados = {};
        aoa[i].forEach((c, idx) => { if (c !== null && c !== undefined) normalizados[norm(c)] = idx; });
        const m = {};
        for (const [logico, sin] of Object.entries(COLUNAS_PESSOAS)) {
          for (const s of sin) if (s in normalizados) { m[logico] = normalizados[s]; break; }
        }
        if ("nome" in m && "valor" in m) { linhaCab = i; mapa = m; break; }
      }
      if (linhaCab < 0) continue;

      const pessoas = [];
      for (let r = linhaCab + 1; r < aoa.length; r++) {
        const row = aoa[r];
        const get = (col) => { const i = mapa[col]; return (i !== undefined && i < row.length) ? row[i] : null; };
        const nome = get("nome");
        const valor = toFloat(get("valor"));
        if ((nome === null || nome === undefined || String(nome).trim() === "") && valor === 0) continue;
        if (nome === null || nome === undefined || String(nome).trim() === "") continue;
        const id = get("id");
        pessoas.push({
          id: id !== null && id !== undefined ? String(id).trim() : "",
          nome: String(nome).trim(),
          valor,
        });
      }
      if (pessoas.length) return { pessoas, aba: nomeAba };
    }
    throw new Error("Não encontrei colunas de Nome e Valor na lista importada.");
  }

  // Lê duas colunas copiadas de uma planilha: identificador/nome e valor.
  function parsePessoasColadas(texto) {
    if (typeof texto !== "string" || !texto.trim()) return [];
    const itens = [];
    for (const linha of texto.split(/\r?\n/)) {
      if (!linha.trim()) continue;
      const colunas = linha.includes("\t") ? linha.split("\t") : linha.split(";");
      if (colunas.length < 2) continue;
      const chave = String(colunas[0] || "").trim();
      const valorBruto = String(colunas[colunas.length - 1] || "").trim();
      if (!chave || !/\d/.test(valorBruto)) continue;
      itens.push({ chave, valor: toFloat(valorBruto) });
    }
    return itens;
  }

  function parseBoletoSulAmerica(texto) {
    if (typeof texto !== "string" || !/SUL\s*AMERICA/i.test(texto)) {
      throw new Error("O PDF não foi reconhecido como uma fatura da SulAmérica.");
    }
    const limpo = texto
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ");

    const competencia = limpo.match(
      /Compet[eê]ncia:\s*(\d{2}\/\d{2}\/\d{4})\s+(?:A|a)\s+(\d{2}\/\d{2}\/\d{4})/i
    );
    const fimCompetencia = competencia?.[2] || "";
    const partesFim = fimCompetencia.split("/");
    const mes = partesFim.length === 3 ? `${partesFim[2]}-${partesFim[1]}` : "";

    const valor = limpo.match(/VALOR TOTAL:\s*(?:R\$\s*)?([\d.]+,\d{2})/i);
    const vencimento = limpo.match(/Vencimento[^\d\n]*(?:\n[^\n]*)?(\d{2}\/\d{2}\/\d{4})/i);
    const documento = limpo.match(
      /N[úu]mero do Documento[^\n]*\n[^\n]*?\b(\d{10,})\b/i
    ) || limpo.match(/\b(75777\d{9})\b/);
    const contrato = limpo.match(/Empresa:\s*([0-9]+-[A-Z0-9-]+)/i)
      || limpo.match(/Pagador:\s*\n?\s*([A-Z0-9]+)\s*-/i);
    const empresa = limpo.match(/Raz[aã]o Social:\s*([^\n]+)/i)
      || limpo.match(/Pagador:\s*\n?\s*[A-Z0-9]+\s*-\s*([^\n]+)/i);

    const pessoas = [];
    const totalFamilia = /Total da Fam[ií]lia:\s*R\$\s*([\d.]+,\d{2})/gi;
    let inicioSegmento = 0;
    let totalMatch;
    while ((totalMatch = totalFamilia.exec(limpo)) !== null) {
      const segmento = limpo.slice(inicioSegmento, totalMatch.index);
      const titular = /(\d{17})\s+(.+?)\s+(\d{3}\.\d{3}\.\d{3}-\d{2})\s+(\d{6,})\s+\d{2}\/\d{2}\/\d{4}\s+\d{1,3}\s+TITULAR\b/gi;
      let titularMatch;
      let ultimoTitular = null;
      while ((titularMatch = titular.exec(segmento)) !== null) ultimoTitular = titularMatch;

      if (ultimoTitular) {
        const nome = ultimoTitular[2]
          .replace(/^\d{5}-[A-ZÀ-Ý]+(?:\s+\d+)?\s+/i, "")
          .replace(/\s+/g, " ")
          .trim();
        pessoas.push({
          id: ultimoTitular[4],
          nome,
          cpf: ultimoTitular[3],
          valor: toFloat(totalMatch[1]),
        });
      }
      inicioSegmento = totalFamilia.lastIndex;
    }

    const totalGeral = limpo.match(/Total Geral:\s*R\$\s*([\d.]+,\d{2})/i);
    const qtdSegurados = limpo.match(/Total de Segurados:\s*(\d+)/i);
    const totalFamilias = round(pessoas.reduce((soma, pessoa) => soma + pessoa.valor, 0), 2);

    if (!valor || !mes || !pessoas.length) {
      throw new Error(
        "A fatura SulAmérica foi reconhecida, mas não encontrei competência, valor total e famílias de segurados."
      );
    }

    return {
      seguradora: "SulAmérica",
      codigo_boleto: documento?.[1] || contrato?.[1] || "",
      contrato: contrato?.[1] || "",
      empresa: empresa?.[1]?.trim() || "",
      competencia_inicio: competencia?.[1] || "",
      competencia_fim: fimCompetencia,
      mes,
      vencimento: vencimento?.[1] || "",
      valor_boleto: toFloat(valor[1]),
      pessoas,
      total_familias: totalFamilias,
      total_geral_relatorio: totalGeral ? toFloat(totalGeral[1]) : totalFamilias,
      qtd_segurados: qtdSegurados ? Number(qtdSegurados[1]) : null,
    };
  }

  function parseBoletoPdfText(texto) {
    if (/SUL\s*AMERICA/i.test(String(texto || ""))) return parseBoletoSulAmerica(texto);
    throw new Error("Ainda não reconheço o layout deste boleto.");
  }

  function combinarBoletos(lista) {
    const boletos = Array.isArray(lista) ? lista.filter(Boolean) : [];
    if (!boletos.length) throw new Error("Selecione ao menos um boleto em PDF.");

    const meses = [...new Set(boletos.map((boleto) => boleto.mes).filter(Boolean))];
    if (meses.length !== 1 || boletos.some((boleto) => !boleto.mes)) {
      throw new Error("Todos os boletos precisam ter a mesma competência.");
    }

    const valoresUnicos = (campo) => [...new Set(
      boletos.map((boleto) => String(boleto[campo] || "").trim()).filter(Boolean)
    )];
    const pessoasPorChave = new Map();

    boletos.forEach((boleto) => {
      (boleto.pessoas || []).forEach((pessoa) => {
        const id = String(pessoa.id || "").trim();
        const idNormalizado = id.replace(/^0+(?=\d)/, "");
        const cpf = String(pessoa.cpf || "").replace(/\D/g, "");
        const chave = idNormalizado
          ? `id:${idNormalizado}`
          : cpf
            ? `cpf:${cpf}`
            : `nome:${norm(pessoa.nome || "")}`;
        if (!chave || chave === "nome:") return;

        const existente = pessoasPorChave.get(chave);
        if (existente) {
          existente.valor = round(existente.valor + toFloat(pessoa.valor), 2);
          return;
        }
        pessoasPorChave.set(chave, {
          id,
          nome: String(pessoa.nome || "").trim(),
          cpf: String(pessoa.cpf || "").trim(),
          valor: round(toFloat(pessoa.valor), 2),
        });
      });
    });

    const pessoas = [...pessoasPorChave.values()];
    return {
      seguradora: valoresUnicos("seguradora").join(" + "),
      codigo_boleto: valoresUnicos("codigo_boleto").join(" + "),
      contrato: valoresUnicos("contrato").join(" + "),
      empresa: valoresUnicos("empresa").join(" + "),
      competencia_inicio: valoresUnicos("competencia_inicio").join(", "),
      competencia_fim: valoresUnicos("competencia_fim").join(", "),
      mes: meses[0],
      vencimento: valoresUnicos("vencimento").join(", "),
      valor_boleto: round(boletos.reduce((soma, boleto) => soma + toFloat(boleto.valor_boleto), 0), 2),
      pessoas,
      total_familias: round(pessoas.reduce((soma, pessoa) => soma + pessoa.valor, 0), 2),
      total_geral_relatorio: round(
        boletos.reduce((soma, boleto) => soma + toFloat(boleto.total_geral_relatorio), 0),
        2
      ),
      qtd_segurados: boletos.reduce((soma, boleto) => soma + (Number(boleto.qtd_segurados) || 0), 0),
      quantidade_boletos: boletos.length,
    };
  }

  // ---- Validação de entrada (independente da UI) ----
  // Checagem comum a qualquer lista de pessoas com valor (segurados/funcionários).
  function _checarLista(lista, rotulo) {
    const erros = [];
    const itens = Array.isArray(lista) ? lista : [];
    if (!itens.length) erros.push(`Adicione ao menos um ${rotulo}.`);

    const chaves = new Set(), dups = new Set();
    let soma = 0;
    for (const s of itens) {
      const v = toFloat(s.valor);
      soma += v;
      if (v < 0) erros.push(`Valor negativo informado para "${s.nome || rotulo}".`);
      const chave = String(s.id || "").trim() || norm(s.nome || "");
      if (chave) {
        if (chaves.has(chave)) dups.add(s.nome || chave);
        else chaves.add(chave);
      }
    }
    if (dups.size) erros.push(`${rotulo[0].toUpperCase() + rotulo.slice(1)}(s) repetido(s): ${[...dups].join(", ")}.`);
    if (itens.length && soma <= 0) erros.push(`Informe o valor de pelo menos um ${rotulo}.`);
    return erros;
  }

  function validarEntrada(d) {
    if (!d || typeof d !== "object") return { ok: false, erros: ["Dados de entrada ausentes."] };
    const erros = [];
    if (!d.mes) erros.push("Selecione o mês de referência.");
    if (!d.seguradora || !String(d.seguradora).trim()) erros.push("Informe a seguradora.");
    if (!d.codigo_boleto || !String(d.codigo_boleto).trim()) erros.push("Informe o código do boleto.");
    const vb = Number(d.valor_boleto);
    if (!isFinite(vb) || vb <= 0) erros.push("O valor do boleto deve ser maior que zero.");
    erros.push(..._checarLista(d.segurados, "segurado"));
    return { ok: erros.length === 0, erros };
  }

  function validarFerias(d) {
    if (!d || typeof d !== "object") return { ok: false, erros: ["Dados de entrada ausentes."] };
    const erros = [];
    if (!d.mes) erros.push("Selecione o mês de referência.");
    erros.push(..._checarLista(d.funcionarios, "funcionário"));
    return { ok: erros.length === 0, erros };
  }

  // ---- Motor comum de rateio ----
  // Distribui o valor de cada pessoa pelos GPs do mês conforme a Proporção de Hora.
  // `itens`: [{id, nome, valor}]. Retorna a agregação por GP + auditoria + diagnósticos.
  function _ratear(ts, mk, itens) {
    const porId = new Map(), porNome = new Map();
    let totalItens = 0;
    for (const s of itens) {
      const v = toFloat(s.valor);
      totalItens += v;
      if (s.id) porId.set(String(s.id).trim(), v);
      if (s.nome) porNome.set(norm(s.nome), v);
    }
    const valorDe = (l) => {
      if (l.id && porId.has(l.id)) return porId.get(l.id);
      const n = norm(l.nome);
      if (porNome.has(n)) return porNome.get(n);
      return null;
    };

    const temp2 = [];
    const comHoras = new Set();
    for (const l of ts.linhas) {
      if (l.mes_key !== mk) continue;
      const v = valorDe(l);
      if (v === null) continue;
      comHoras.add(l.id || norm(l.nome));
      temp2.push({
        id: l.id, nome: l.nome, gp: l.gp, horas: l.horas, proporcao: l.proporcao,
        valor_pessoa: v, valor_linha: v * l.proporcao,
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

    const semHoras = itens
      .filter((s) => !comHoras.has(String(s.id || "").trim() || norm(s.nome || "")))
      .map((s) => s.nome);

    // Integridade da TS: as proporções de cada pessoa no mês devem somar ~1.
    const propPorPessoa = new Map();
    for (const r of temp2) {
      const k = r.id || norm(r.nome);
      const cur = propPorPessoa.get(k) || { nome: r.nome, soma: 0 };
      cur.soma += r.proporcao;
      propPorPessoa.set(k, cur);
    }
    const proporcaoSuspeita = [...propPorPessoa.values()]
      .filter((x) => Math.abs(x.soma - 1) > 0.01)
      .map((x) => ({ nome: x.nome, soma: round(x.soma, 4) }));

    return { temp2, valorPorGp, horasPorGp, totalItens, totalValor, gps, semHoras, proporcaoSuspeita };
  }

  // Joga a diferença de arredondamento (alvo - soma) no GP de maior valor_final.
  function _ajustarCentavos(tabelaFinal, alvo) {
    const soma = tabelaFinal.reduce((a, r) => a + r.valor_final, 0);
    const dif = round(alvo - soma, 2);
    if (tabelaFinal.length && dif !== 0) {
      let maior = tabelaFinal[0];
      for (const r of tabelaFinal) if (r.valor_final > maior.valor_final) maior = r;
      maior.valor_final = round(maior.valor_final + dif, 2);
    }
  }

  // ---- Rateio de Plano de Saúde (valor do boleto rateado pela proporção) ----
  function calcularPlanoSaude(ts, mk, segurados, valorBoleto) {
    valorBoleto = Number(valorBoleto);
    const a = _ratear(ts, mk, segurados);
    const tabelaFinal = a.gps.map((gp) => {
      const valor = a.valorPorGp.get(gp);
      const prop = a.totalValor ? valor / a.totalValor : 0;
      return {
        gp, horas: round(a.horasPorGp.get(gp) || 0, 4),
        valor: round(valor, 2), proporcao: prop, valor_final: round(valorBoleto * prop, 2),
      };
    });
    _ajustarCentavos(tabelaFinal, valorBoleto);

    return {
      tipo: "plano_saude",
      mes_key: mk,
      valor_boleto: round(valorBoleto, 2),
      total_segurados: round(a.totalItens, 2),
      total_valor_rateado: round(a.totalValor, 2),
      diferenca_boleto_segurados: round(valorBoleto - a.totalItens, 2),
      qtd_gps: tabelaFinal.length,
      qtd_segurados: segurados.length,
      // chaves específicas (compatibilidade) + genéricas (UI)
      segurados_sem_horas: a.semHoras,
      segurados_proporcao_suspeita: a.proporcaoSuspeita,
      sem_horas: a.semHoras,
      proporcao_suspeita: a.proporcaoSuspeita,
      temp2: a.temp2, tabela_final: tabelaFinal,
    };
  }

  // ---- Rateio de Férias (valor por funcionário; VALOR FINAL = VALOR, sem boleto) ----
  function calcularFerias(ts, mk, funcionarios) {
    const a = _ratear(ts, mk, funcionarios);
    const tabelaFinal = a.gps.map((gp) => {
      const valor = a.valorPorGp.get(gp);
      const prop = a.totalValor ? valor / a.totalValor : 0;
      return {
        gp, horas: round(a.horasPorGp.get(gp) || 0, 4),
        valor: round(valor, 2), proporcao: prop, valor_final: round(valor, 2),
      };
    });
    // fecha a soma no que foi de fato rateado (totalValor)
    _ajustarCentavos(tabelaFinal, round(a.totalValor, 2));

    return {
      tipo: "ferias",
      mes_key: mk,
      total_ferias: round(a.totalItens, 2),
      total_valor_rateado: round(a.totalValor, 2),
      qtd_gps: tabelaFinal.length,
      qtd_funcionarios: funcionarios.length,
      funcionarios: funcionarios.map((f) => f.nome),
      funcionarios_sem_horas: a.semHoras,
      funcionarios_proporcao_suspeita: a.proporcaoSuspeita,
      sem_horas: a.semHoras,
      proporcao_suspeita: a.proporcaoSuspeita,
      temp2: a.temp2, tabela_final: tabelaFinal,
    };
  }

  function nomeArquivoFerias(mk, nomes) {
    const [ano, mes] = mk.split("-");
    const distintos = [...new Set((nomes || []).filter(Boolean))];
    const ident = distintos.length === 1 ? sanitizar(distintos[0]) : `${distintos.length}-funcionarios`;
    return `${ano.slice(2)}-${mes}-Ferias-${ident}.xlsx`;
  }

  // ---- Preparação da exportação (metadados + nome do arquivo, por tipo) ----
  function prepararExport(res, extra) {
    extra = extra || {};
    if (res.tipo === "ferias") {
      return {
        titulo: "Rateio de Férias por GP",
        info: [["Mês", res.mes_key], ["Soma das férias", res.total_ferias]],
        detalheAba: "Detalhe_Funcionarios",
        colValor: "Valor Férias",
        nomeArquivo: nomeArquivoFerias(res.mes_key, res.funcionarios),
      };
    }
    return {
      titulo: "Rateio de Plano de Saúde por GP",
      info: [
        ["Seguradora", extra.seguradora],
        ["Código do boleto", extra.codigo_boleto],
        ["Mês", res.mes_key],
        ["Valor do boleto", res.valor_boleto],
        ["Soma dos segurados", res.total_segurados],
      ],
      detalheAba: "Detalhe_Segurados",
      colValor: "Valor Segurado",
      nomeArquivo: nomeArquivoSaida(res.mes_key, extra.seguradora, extra.codigo_boleto),
    };
  }

  // ---- Montagem do workbook de saída (genérica; download fica na UI) ----
  function montarWorkbook(res, meta) {
    const wb = XLSX.utils.book_new();
    const tf = res.tabela_final;
    const info = meta.info || [];

    const aoa = [[meta.titulo]];
    info.forEach((r) => aoa.push(r));
    aoa.push([]);
    const cab = aoa.length;                 // índice da linha de cabeçalho da tabela
    aoa.push(["GP", "HORAS", "VALOR", "PROPORÇÃO", "VALOR FINAL"]);
    tf.forEach((r) => aoa.push([r.gp, r.horas, r.valor, r.proporcao, r.valor_final]));
    aoa.push([
      "TOTAL",
      round(tf.reduce((a, r) => a + r.horas, 0), 4),
      round(tf.reduce((a, r) => a + r.valor, 0), 2),
      round(tf.reduce((a, r) => a + r.proporcao, 0), 6),
      round(tf.reduce((a, r) => a + r.valor_final, 0), 2),
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 16 }];
    const fmt = (r, c, z) => { const ref = XLSX.utils.encode_cell({ r, c }); if (ws[ref]) ws[ref].z = z; };
    info.forEach((r, i) => { if (typeof r[1] === "number") fmt(1 + i, 1, "#,##0.00"); });
    const fim = cab + tf.length + 1;
    for (let r = cab + 1; r <= fim; r++) { fmt(r, 2, "#,##0.00"); fmt(r, 3, "0.0000%"); fmt(r, 4, "#,##0.00"); }
    XLSX.utils.book_append_sheet(wb, ws, "Rateio");

    const aoa2 = [[
      "Id Colaborador", "Nome Colaborador", "GP", "Horas Trabalhadas",
      "Proporção de Hora", meta.colValor || "Valor", "Valor Rateado (Valor×Prop.)",
    ]];
    res.temp2.forEach((r) =>
      aoa2.push([r.id, r.nome, r.gp, r.horas, r.proporcao, round(r.valor_pessoa, 2), round(r.valor_linha, 2)]));
    const ws2 = XLSX.utils.aoa_to_sheet(aoa2);
    ws2["!cols"] = [{ wch: 16 }, { wch: 28 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws2, meta.detalheAba || "Detalhe");

    return wb;
  }

  return {
    XLSX, COLUNAS, OBRIGATORIAS, COLUNAS_PESSOAS,
    norm, mesKey, toFloat, round, sanitizar, nomeArquivoSaida, nomeArquivoFerias,
    carregarTS, colaboradores, carregarPessoas, parsePessoasColadas,
    parseBoletoSulAmerica, parseBoletoPdfText, combinarBoletos,
    validarEntrada, validarFerias,
    calcularPlanoSaude, calcularFerias,
    prepararExport, montarWorkbook,
  };
});
