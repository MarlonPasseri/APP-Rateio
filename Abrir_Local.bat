@echo off
REM Abre o APP de Rateio localmente (versao navegador), servindo a pasta docs.
REM Use isto apenas se quiser rodar offline; o normal e usar a URL do GitHub Pages.
cd /d "%~dp0"
start "" http://127.0.0.1:5500
python -m http.server 5500 -d docs
pause
