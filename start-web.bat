@echo off
cd /d "%~dp0"
title Concord - Web Mode (Multi-Tab Testing)
echo Iniciando Concord no Navegador...
start http://localhost:5173
npm run dev:web
pause
