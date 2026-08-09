@echo off
REM ============================================================================
REM  commit-push.bat  —  коммит + push на GitHub + деплой на хостинг
REM ----------------------------------------------------------------------------
REM  Запуск:
REM     commit-push.bat                    авто-сообщение коммита
REM     commit-push.bat "fix hero spacing" своё сообщение (в кавычках)
REM
REM  Этапы:
REM    1. проверка вручную подготовленного staging area + commit + push на GitHub
REM    2. Подтверждение (Y/N) перед деплоем на прод
REM    3. По SSH: git pull + git lfs pull + sudo bash deploy/deploy.sh на VPS
REM       (91.227.68.176, пользователь codex-deploy)
REM
REM  Скрипт намеренно НЕ делает git add: добавляй только явно проверенные файлы
REM  вручную, например: git add deploy/deploy.sh DEPLOY.md.
REM  Код деплоя и ранбук — см. DEPLOY.md.
REM ============================================================================

setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"

REM --- настройки деплоя ------------------------------------------------------
set "VPS_HOST=91.227.68.176"
set "VPS_USER=codex-deploy"
set "SSH_KEY=C:\Users\Elena\.ssh\jd_landing_deploy"
set "RELEASE_DIR=/opt/jd-landing/release"

REM --- сообщение коммита -----------------------------------------------------
set "MSG=%~1"
if "!MSG!"=="" (
  for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"
  for /f "delims=" %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm"') do set "STAMP=%%d"
  set "MSG=update !BRANCH! !STAMP!"
)

echo ============================================================
echo  1/3  КОММИТ
echo ============================================================
git rev-parse --abbrev-ref HEAD 2>nul
if errorlevel 1 (
  echo ERROR: это не git-репозиторий.
  goto :fail
)

echo.
echo --- Изменения перед коммитом ---
git status -s

echo.
echo --- Подготовленные для коммита файлы ---
git diff --cached --name-status

REM --- есть ли что коммитить? ------------------------------------------------
git diff --cached --quiet
if !errorlevel! equ 0 (
  echo.
  echo ERROR: нет подготовленных изменений.
  echo Сначала проверь git status -s и выполни git add только для нужных файлов.
  goto :fail
)

echo.
echo --- git commit ---
echo Сообщение: !MSG!
git commit -m "!MSG!"
if errorlevel 1 (
  echo ERROR: коммит не удался.
  goto :fail
)

:push
echo.
echo ============================================================
echo  2/3  PUSH на GitHub
echo ============================================================
git push
if errorlevel 1 (
  echo ERROR: push не удался. Проверь сеть/доступ к GitHub.
  goto :fail
)

echo.
echo ============================================================
echo  3/3  ДЕПЛОЙ на хостинг (!VPS_HOST!)
echo ============================================================
echo.
echo Будет выполнено по SSH ^(!VPS_USER!@!VPS_HOST!^):
echo     cd !RELEASE_DIR!
echo     git pull --ff-only
echo     git lfs pull
echo     cd deploy ^&^& sudo bash deploy.sh
echo.
echo deploy.sh: пересборка образа ^> ожидание healthcheck ^>
echo           очистка ISR-заглушек главной и каталога ^> revalidate ^> проверка.
echo.
set /p "DO_DEPLOY=Выкатить на прод? [y/N]: "
if /i not "!DO_DEPLOY!"=="y" (
  echo.
  echo Деплой отменён. Код на GitHub, на хостинге без изменений.
  echo Чтобы выкатить вручную — см. DEPLOY.md, раздел 4.
  goto :done
)

echo.
echo --- Подключение к VPS и запуск deploy.sh ---
echo ^(если sudo запросит пароль — введи пароль пользователя !VPS_USER!^)
echo.
ssh -t -i "!SSH_KEY!" !VPS_USER!@!VPS_HOST! "cd !RELEASE_DIR! && git pull --ff-only && git lfs pull && cd deploy && sudo bash deploy.sh"
if errorlevel 1 (
  echo.
  echo ERROR: деплой завершился с ошибкой. Проверь вывод выше.
  echo ^("sudo bash deploy.sh" выходит с code 1, если homepage/catalog показывают заглушку^).
  goto :fail
)

echo.
echo ============================================================
echo  Готово. Код закоммичен, запушен и выкачен на прод.
echo  Проверь чек-лист после деплоя — DEPLOY.md, раздел 9.
echo ============================================================
goto :done

:fail
echo.
echo ============================================================
echo  ОШИБКА — этап прерван. Смотри вывод выше.
echo ============================================================
pause
exit /b 1

:done
echo.
pause
endlocal
