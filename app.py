"""
APP de Rateio por GP — servidor web (Flask).

Tipos de rateio previstos: Plano de Saúde (implementado), Férias, Rescisão e 13º.
Execute com:  python app.py   e abra http://127.0.0.1:5000 no navegador.
"""

import os
import uuid

from flask import (
    Flask,
    jsonify,
    request,
    render_template,
    send_from_directory,
)
from werkzeug.utils import secure_filename

import rateio

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
SAIDA_DIR = os.path.join(BASE_DIR, "saidas")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(SAIDA_DIR, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 60 * 1024 * 1024  # 60 MB

# Cache em memória das planilhas TS carregadas, por token.
_PLANILHAS: dict[str, rateio.PlanilhaTS] = {}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload():
    if "arquivo" not in request.files:
        return jsonify({"erro": "Nenhum arquivo enviado."}), 400
    f = request.files["arquivo"]
    if not f.filename:
        return jsonify({"erro": "Nenhum arquivo selecionado."}), 400
    if not f.filename.lower().endswith((".xlsx", ".xlsm")):
        return jsonify({"erro": "Envie um arquivo .xlsx."}), 400

    token = uuid.uuid4().hex
    caminho = os.path.join(UPLOAD_DIR, f"{token}_{secure_filename(f.filename)}")
    f.save(caminho)

    try:
        ts = rateio.carregar_ts(caminho)
    except Exception as e:  # noqa: BLE001
        return jsonify({"erro": str(e)}), 400
    finally:
        try:
            os.remove(caminho)
        except OSError:
            pass

    _PLANILHAS[token] = ts
    return jsonify(
        {
            "token": token,
            "aba": ts.aba,
            "meses": ts.meses,
            "qtd_linhas": len(ts.linhas),
        }
    )


@app.route("/colaboradores")
def colaboradores():
    token = request.args.get("token", "")
    mes = request.args.get("mes", "")
    ts = _PLANILHAS.get(token)
    if not ts:
        return jsonify({"erro": "Sessão expirada. Importe a planilha novamente."}), 400
    return jsonify({"colaboradores": ts.colaboradores(mes)})


@app.route("/calcular", methods=["POST"])
def calcular():
    dados = request.get_json(force=True)
    token = dados.get("token", "")
    ts = _PLANILHAS.get(token)
    if not ts:
        return jsonify({"erro": "Sessão expirada. Importe a planilha novamente."}), 400

    mes = dados.get("mes", "")
    seguradora = (dados.get("seguradora") or "").strip()
    codigo = (dados.get("codigo_boleto") or "").strip()
    segurados = dados.get("segurados") or []

    if not mes:
        return jsonify({"erro": "Selecione o mês do boleto."}), 400
    if not seguradora or not codigo:
        return jsonify({"erro": "Informe a seguradora e o código do boleto."}), 400
    if not segurados:
        return jsonify({"erro": "Adicione ao menos um segurado."}), 400

    try:
        valor_boleto = float(dados.get("valor_boleto") or 0)
    except (TypeError, ValueError):
        return jsonify({"erro": "Valor do boleto inválido."}), 400
    if valor_boleto <= 0:
        return jsonify({"erro": "O valor do boleto deve ser maior que zero."}), 400

    resultado = rateio.calcular_plano_saude(ts, mes, segurados, valor_boleto)
    if not resultado["tabela_final"]:
        return jsonify(
            {
                "erro": "Nenhuma hora encontrada na TS para os segurados no mês "
                "selecionado. Verifique os nomes/mês."
            }
        ), 400

    meta = {"seguradora": seguradora, "codigo_boleto": codigo}
    nome_arq = rateio.nome_arquivo_saida(mes, seguradora, codigo)
    caminho = os.path.join(SAIDA_DIR, nome_arq)
    rateio.exportar_xlsx(resultado, meta, caminho)

    resultado["arquivo"] = nome_arq
    return jsonify(resultado)


@app.route("/download/<path:nome>")
def download(nome):
    return send_from_directory(SAIDA_DIR, nome, as_attachment=True)


if __name__ == "__main__":
    print("APP de Rateio rodando em  http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=False)
