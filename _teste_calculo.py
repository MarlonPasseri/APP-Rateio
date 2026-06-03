"""Teste rápido do núcleo de cálculo usando a base de exemplo."""
import os
import rateio

BASE = r"C:/Users/marlon.soares/Downloads/BASE DADOS - 13 - SEM SALAIRO.xlsx"

ts = rateio.carregar_ts(BASE)
print("Aba TS:", ts.aba, "| linhas:", len(ts.linhas), "| meses:", ts.meses[:3], "...")

mes = "2025-01"
colabs = ts.colaboradores(mes)
print("Colaboradores no mês:", len(colabs))

# Pega 3 colaboradores reais do mês e dá valores fictícios.
segurados = [
    {"id": colabs[0]["id"], "nome": colabs[0]["nome"], "valor": 800.00},
    {"id": colabs[1]["id"], "nome": colabs[1]["nome"], "valor": 1200.50},
    {"id": colabs[2]["id"], "nome": colabs[2]["nome"], "valor": 450.00},
]
valor_boleto = 2500.00
print("Segurados:", [(s["nome"], s["valor"]) for s in segurados])
print("Soma segurados:", sum(s["valor"] for s in segurados), "| Boleto:", valor_boleto)

res = rateio.calcular_plano_saude(ts, mes, segurados, valor_boleto)

print("\n--- VERIFICAÇÕES ---")
print("total_segurados      :", res["total_segurados"])
print("total_valor_rateado  :", res["total_valor_rateado"], "(deve ~= total_segurados)")
print("qtd_gps              :", res["qtd_gps"])
print("segurados_sem_horas  :", res["segurados_sem_horas"])

soma_prop = sum(r["proporcao"] for r in res["tabela_final"])
soma_final = sum(r["valor_final"] for r in res["tabela_final"])
print("soma proporcao       :", round(soma_prop, 6), "(deve = 1)")
print("soma valor_final     :", round(soma_final, 2), "(deve = boleto)")

print("\nGP | VALOR | PROP | VALOR FINAL (top 8)")
for r in sorted(res["tabela_final"], key=lambda x: -x["valor_final"])[:8]:
    print(f'{r["gp"]:>6} | {r["valor"]:>9.2f} | {r["proporcao"]:.4%} | {r["valor_final"]:>9.2f}')

# Exporta
meta = {"seguradora": "Bradesco", "codigo_boleto": "BoletoX123"}
nome = rateio.nome_arquivo_saida(mes, meta["seguradora"], meta["codigo_boleto"])
caminho = os.path.join(os.path.dirname(__file__), "saidas", nome)
rateio.exportar_xlsx(res, meta, caminho)
print("\nArquivo gerado:", nome, "->", os.path.exists(caminho))
