#!/bin/sh
# Entrypoint-Script zum sicheren Laden der .env-Datei

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

# Lade einheitliche .env Datei (optional für Docker)
if load_env_file /config/.env; then
    echo "✓ .env Datei geladen"
else
    echo "✓ Verwende Umgebungsvariablen aus Container (portainer-stack.yml)"
fi

# Prüfe ob Pflichtfelder gesetzt sind
if [ -z "$DELETE_PASSWORD" ]; then
    echo "❌ FEHLER: DELETE_PASSWORD nicht gesetzt!"
    exit 1
fi

if [ -z "$NAMEN" ]; then
    echo "❌ FEHLER: NAMEN nicht gesetzt!"
    exit 1
fi

# Prüfe Fahrzeugkonfiguration (mindestens ein Fahrzeug muss definiert sein)
if [ -z "$VEHICLE_1_ID" ]; then
    echo "❌ FEHLER: Keine Fahrzeuge konfiguriert!"
    echo "  Mindestens VEHICLE_1_ID muss gesetzt sein"
    exit 1
fi

echo "✓ Alle Umgebungsvariablen geladen"
echo "✓ Anzahl Namen: $(echo "$NAMEN" | awk -F',' '{print NF}')"

if [ -n "$EMAIL_RECIPIENTS_BERICHT" ]; then
    echo "✓ E-Mail-Empfänger (Einsatzberichte): $(echo "$EMAIL_RECIPIENTS_BERICHT" | awk -F',' '{print NF}')"
fi

if [ -n "$EMAIL_RECIPIENTS_ANWESENHEIT" ]; then
    echo "✓ E-Mail-Empfänger (Anwesenheitslisten): $(echo "$EMAIL_RECIPIENTS_ANWESENHEIT" | awk -F',' '{print NF}')"
fi

if [ -n "$EMAIL_RECIPIENTS_SONDER" ]; then
    echo "✓ E-Mail-Empfänger (Sonderdienste): $(echo "$EMAIL_RECIPIENTS_SONDER" | awk -F',' '{print NF}')"
fi

# Zähle konfigurierte Fahrzeuge
vehicle_count=0
for i in $(seq 1 20); do
    var_name="VEHICLE_${i}_ID"
    eval "var_value=\$$var_name"
    if [ -n "$var_value" ]; then
        vehicle_count=$((vehicle_count + 1))
    else
        break
    fi
done
echo "✓ Anzahl konfigurierte Fahrzeuge: $vehicle_count"

# Setze sichere Berechtigungen für die Config-Datei
chmod 400 /config/.env 2>/dev/null || true

# Starte Node.js Anwendung
echo "=== Starte Node.js Server ==="
exec node server.js
