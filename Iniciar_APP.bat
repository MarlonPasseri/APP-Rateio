@echo off
REM Inicia o APP de Rateio por GP e abre o navegador.
cd /d "%~dp0"

echo Verificando dependencias...
python -m pip install -q -r requirements.txt

echo Iniciando o APP...
start "" http://127.0.0.1:5000
python app.py

pause
