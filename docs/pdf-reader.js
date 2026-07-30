(function (root) {
  "use strict";

  function montarLinhas(items) {
  const linhas = [];
  for (const item of items) {
    if (!item.str || !item.str.trim() || !item.transform) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    let linha = linhas.find((atual) => Math.abs(atual.y - y) < 2);
    if (!linha) {
      linha = { y, itens: [] };
      linhas.push(linha);
    }
    linha.itens.push({ x, texto: item.str.trim() });
  }

  return linhas
    .sort((a, b) => b.y - a.y)
    .map((linha) => linha.itens
      .sort((a, b) => a.x - b.x)
      .map((item) => item.texto)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim())
    .filter(Boolean)
    .join("\n");
  }

  async function extrairTexto(file) {
    if (!file || typeof file.arrayBuffer !== "function") {
      throw new Error("Selecione um boleto em PDF.");
    }
    const data = new Uint8Array(await file.arrayBuffer());
    const tarefa = root.pdfjsLib.getDocument({
      data,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    const pdf = await tarefa.promise;
    const paginas = [];

    try {
      for (let numero = 1; numero <= pdf.numPages; numero++) {
        const pagina = await pdf.getPage(numero);
        const conteudo = await pagina.getTextContent();
        paginas.push(montarLinhas(conteudo.items));
        pagina.cleanup();
      }
    } finally {
      await tarefa.destroy();
    }

    return paginas.join("\n\n");
  }

  if (!root.pdfjsLib?.getDocument) {
    root.RateioPdfErro = "O leitor de PDF não pôde ser carregado.";
  } else {
    root.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
    root.RateioPdf = { extrairTexto };
  }
  root.dispatchEvent(new CustomEvent("rateio-pdf-ready"));
})(window);
