@echo off
echo ========================================
echo Git Setup für Feuerwehr Berichte System
echo ========================================
echo.

REM Prüfen ob Git installiert ist
git --version >nul 2>&1
if errorlevel 1 (
    echo [FEHLER] Git ist nicht installiert!
    echo Bitte installiere Git von: https://git-scm.com/download/win
    pause
    exit /b 1
)

echo [1/7] Git Benutzer konfigurieren...
git config --global user.email "support@feuerwehr-frechen.de"
git config --global user.name "FF-Frechen"
echo    Benutzer: FF-Frechen
echo    E-Mail: support@feuerwehr-frechen.de

echo.
echo [2/7] Git Repository initialisieren...
git init

echo.
echo [3/7] Remote Repository hinzufügen...
git remote add origin https://github.com/FF-Frechen/Berichte.git

echo.
echo [4/7] Alle Dateien zum Staging hinzufügen...
git add .

echo.
echo [5/7] Ersten Commit erstellen...
git commit -m "Initial commit: Docker-basiertes Feuerwehr Berichte System"

echo.
echo [6/7] Branch auf 'main' setzen...
git branch -M main

echo.
echo [7/7] Zu GitHub pushen...
git push -u https://FF-Frechen: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@github.com/FF-Frechen/Berichte.git main

echo.
echo ========================================
echo Setup abgeschlossen!
echo ========================================
echo.
echo Repository ist jetzt auf GitHub verfügbar:
echo https://github.com/FF-Frechen/Berichte
echo.
echo WICHTIG: Lösche diese Datei nach dem Push!
echo (Sie enthält den GitHub Token)
echo.
pause
