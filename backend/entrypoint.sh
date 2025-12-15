#!/bin/sh
# Entrypoint-Script zum sicheren Laden der .env-Dateien

echo "=== Feuerwehr Backend wird gestartet ==="

# Funktion zum sicheren Laden von .env Dateien (behält Leerzeichen)
load_env_file() {
    local file=$1
    if [ -f "$file" ]; then
        # Lese Zeile für Zeile und exportiere
        while IFS= read -r line || [ -n "$line" ]; do
            # Ignoriere Kommentare und leere Zeilen
            case "$line" in
                \#*|'') continue ;;
            esac
            # Export mit eval um Leerzeichen zu erhalten
            export "$line"
        done < "$file"
        return 0
    else
        return 1
    fi
}

# Lade .env.smtp
if load_env_file /config/.env.smtp; then
    echo "✓ .env.smtp geladen"
else
    echo "❌ FEHLER: .env.smtp nicht gefunden in /config/"
    exit 1
fi

# Lade .env.namen  
if load_env_file /config/.env.namen; then
    echo "✓ .env.namen geladen"
else
    echo "❌ FEHLER: .env.namen nicht gefunden in /config/"
    exit 1
fi

# Prüfe ob Pflichtfelder gesetzt sind
if [ -z "$DELETE_PASSWORD" ] || [ -z "$NAMEN" ]; then
    echo "❌ FEHLER: Pflichtfelder nicht gesetzt!"
    echo "DELETE_PASSWORD: ${DELETE_PASSWORD:+gesetzt}"
    echo "NAMEN: ${NAMEN:+gesetzt}"
    exit 1
fi

echo "✓ Alle Umgebungsvariablen geladen"
echo "✓ Anzahl Namen: $(echo "$NAMEN" | awk -F',' '{print NF}')"
if [ -n "$EMAIL_RECIPIENTS" ]; then
    echo "✓ E-Mail-Empfänger (Einsatz): $(echo "$EMAIL_RECIPIENTS" | awk -F',' '{print NF}')"
fi
if [ -n "$EMAIL_RECIPIENTS_ANWESENHEIT" ]; then
    echo "✓ E-Mail-Empfänger (Anwesenheit): $(echo "$EMAIL_RECIPIENTS_ANWESENHEIT" | awk -F',' '{print NF}')"
fi

# Setze sichere Berechtigungen für die Config-Dateien
chmod 400 /config/.env.smtp 2>/dev/null || true
chmod 400 /config/.env.namen 2>/dev/null || true

# Starte Node.js Anwendung
echo "=== Starte Node.js Server ==="
exec node server.js
