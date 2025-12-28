# Feuerwehr Berichte System

Ein Docker-basiertes System zur Verwaltung von Einsatzberichten und Anwesenheitslisten für die Feuerwehr Frechen.

⚠️ **WICHTIG: Dies ist eine private Repository!** Nicht öffentlich teilen.

## 📋 Features

- 📝 **Einsatzberichte** erstellen und als PDF speichern (mit Unterschriften)
- 👥 **Anwesenheitslisten** erfassen (Dienste und Sonderdienste)
- 📧 **Automatischer E-Mail-Versand** mit BCC für Datenschutz (DSGVO-konform)
- 🗄️ **SQLite-Datenbank** zur Datenspeicherung
- 🚗 **Bis zu 50 Fahrzeuge** konfigurierbar
- 📱 **Mobile-optimiert** (iPad Touch-Targets)
- 🔤 **UTF-8 Support** für deutsche Umlaute in PDFs
- 🐳 **Vollständig containerisiert** mit Docker
- 🔒 **Lokaler Betrieb** ohne Internet-Zugang

## 🚀 Schnellstart mit Portainer (EMPFOHLEN)

### Voraussetzungen

- Portainer installiert und läuft
- GitHub Personal Access Token (für private Repo)

### Deployment in Portainer

#### Schritt 1: GitHub Token erstellen (einmalig)

1. Gehe zu GitHub: https://github.com/settings/tokens
2. Klicke **"Generate new token"** → **"Classic"**
3. Name: `Portainer Berichte Deploy`
4. Scopes auswählen: **✅ repo** (voller Zugriff auf private Repositories)
5. Token generieren und **SOFORT KOPIEREN** (wird nur einmal angezeigt!)

#### Schritt 2: Stack in Portainer erstellen

1. **In Portainer:** `Stacks` → `+ Add stack`

2. **Name:** `feuerwehr-berichte`

3. **Build method:** `Repository` ⚠️ WICHTIG!

4. **Repository konfigurieren:**
   ```
   Repository URL: https://github.com/FF-Frechen/Berichte
   Repository reference: refs/heads/deploy
   Compose path: portainer-stack.yml
   ```

5. **Authentication aktivieren:**
   - ✅ GitOps updates
   - Username: `dein-github-username`
   - Personal Access Token: `dein-token-von-schritt-1`

6. **Environment variables:** Scrollen zu "Environment variables" und alle Variablen eintragen:

   **WICHTIG: Werte in Anführungszeichen setzen wenn Sonderzeichen enthalten!**

   ```bash
   # Sicherheit
   DELETE_PASSWORD=dein-sicheres-passwort

   # SMTP-Konfiguration (⚠️ Passwort in Anführungszeichen wenn # oder andere Sonderzeichen!)
   SMTP_HOST=smtp.ionos.de
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=support@feuerwehr-frechen.de
   SMTP_PASS="dein-passwort-hier"  # ⚠️ Anführungszeichen bei Sonderzeichen!

   # E-Mail-Empfänger (BCC - Datenschutz)
   EMAIL_RECIPIENTS_BERICHT=email1@example.com,email2@example.com
   EMAIL_RECIPIENTS_ANWESENHEIT=email1@example.com,email2@example.com
   EMAIL_RECIPIENTS_SONDER=email1@example.com,email2@example.com

   # Namensliste (Komma-getrennt)
   NAMEN=Max Mustermann,Erika Musterfrau,Hans Schmidt,Anna Müller,Peter Weber

   # Fahrzeug 1 (Beispiel - siehe example.env für alle 14 Fahrzeuge)
   VEHICLE_1_ID=hlf20-1
   VEHICLE_1_NAME=FRE 1 / HLF 20 /1
   VEHICLE_1_DISPLAY_NAME=FRE1/HLF20/1 - Hilfeleistungslöschfahrzeug
   VEHICLE_1_FUNCTIONS=Gruppenführer,Maschinist,Angriffstrupp - Führer,Angriffstrupp - Mann,Wassertrupp - Führer,Wassertrupp - Mann,Schlauchtrupp - Führer,Schlauchtrupp - Mann,Melder

   # ... weitere Fahrzeuge bis VEHICLE_14 (siehe example.env)
   # System unterstützt bis zu VEHICLE_50
   ```

7. **Deploy the stack** klicken

8. **Warten** bis alle Container laufen (grün)

9. **Öffnen:** `http://deine-server-ip:8080`

### Updates einspielen

1. In Portainer: `Stacks` → `feuerwehr-berichte`
2. Klicke **"Pull and redeploy"**
3. Fertig! ✅

## 📁 Projektstruktur

```
Berichte/
├── backend/                 # Node.js Backend
│   ├── server.js           # Express Server mit API
│   ├── entrypoint.sh       # Docker-Startup-Script
│   ├── package.json        # Dependencies
│   ├── Dockerfile          # Backend Container
│   └── public/
│       └── client.js       # Frontend-JavaScript
├── frontend/               # HTML Frontend
│   ├── index.html          # Hauptseite (Menü)
│   ├── input_doku.html     # Einsatzdaten eingeben
│   ├── Doku.html           # Einsatz-Dokumentation
│   ├── anwesenheit.html    # Anwesenheitsliste (Dienste)
│   └── anwesenheit_sonder.html  # Sonderdienste
├── nginx/                  # NGINX Reverse Proxy
│   ├── nginx.conf          # Konfiguration
│   └── Dockerfile          # Frontend Container
├── portainer-stack.yml     # Portainer Stack-Definition
├── docker-compose.yml      # Lokale Entwicklung
├── example.env             # Beispiel-Konfiguration
└── README.md               # Diese Datei
```

## ⚙️ Konfiguration

### Umgebungsvariablen

Alle Einstellungen werden über Umgebungsvariablen konfiguriert. In Portainer direkt eingeben, lokal in `.env` Datei.

#### Wichtige Variablen

```bash
# Sicherheit
DELETE_PASSWORD=dein-sicheres-passwort

# SMTP (E-Mail-Versand)
SMTP_HOST=smtp.ionos.de
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=support@feuerwehr-frechen.de
SMTP_PASS="passwort123#"  # ⚠️ Anführungszeichen bei # oder Sonderzeichen!

# E-Mail-Empfänger (werden als BCC versendet - Datenschutz!)
EMAIL_RECIPIENTS_BERICHT=email1@example.com,email2@example.com
EMAIL_RECIPIENTS_ANWESENHEIT=email1@example.com
EMAIL_RECIPIENTS_SONDER=email1@example.com

# Namensliste für Autocomplete
NAMEN=Max Mustermann,Erika Musterfrau,Hans Schmidt
```

### Fahrzeugkonfiguration

**Unterstützte Anzahl:** 1 bis 50 Fahrzeuge

Jedes Fahrzeug benötigt 4 Variablen:

```bash
VEHICLE_1_ID=hlf20-1                    # Eindeutige ID
VEHICLE_1_NAME=FRE 1 / HLF 20 /1       # Name für PDF
VEHICLE_1_DISPLAY_NAME=FRE1/HLF20/1 - Hilfeleistungslöschfahrzeug  # Anzeigename
VEHICLE_1_FUNCTIONS=Gruppenführer,Maschinist,Angriffstrupp - Führer,...  # Funktionen
```

**Vollständige Konfiguration:** Siehe `example.env` für alle 14 Standard-Fahrzeuge.

**Reihenfolge:** Die Nummerierung (1, 2, 3...) bestimmt die Anzeigereihenfolge.

## 🔧 Lokale Entwicklung (docker-compose)

```bash
# Repository klonen
git clone https://github.com/FF-Frechen/Berichte.git
cd Berichte

# .env Datei erstellen
cp example.env .env
# .env bearbeiten mit deinen Daten

# Container starten
docker-compose up -d

# Logs anzeigen
docker-compose logs -f

# Container stoppen
docker-compose down

# Neu bauen
docker-compose up -d --build
```

Anwendung öffnen: `http://localhost`

## 🐛 Troubleshooting

### Container startet nicht

```bash
# Logs prüfen in Portainer:
# Stacks → feuerwehr-berichte → Container auswählen → Logs

# Oder in SSH/Shell:
docker logs feuerwehr-backend
docker logs feuerwehr-frontend
```

**Häufige Fehler:**
- `DELETE_PASSWORD nicht gesetzt` → Environment Variable vergessen
- `NAMEN nicht gesetzt` → NAMEN Variable fehlt
- `Keine Fahrzeuge konfiguriert` → Mindestens VEHICLE_1_* muss gesetzt sein

### E-Mail-Versand funktioniert nicht

1. **SMTP-Zugangsdaten prüfen:**
   - Backend-Logs zeigen SMTP-Konfiguration beim Start
   - `[EMAIL]` Logs zeigen Details beim Versand

2. **Passwort mit Sonderzeichen (# ! etc.):**
   ```bash
   # FALSCH:
   SMTP_PASS=passwort#123

   # RICHTIG:
   SMTP_PASS="passwort#123"
   ```

3. **Firewall/Ports prüfen:**
   - Port 465 (SMTP SSL) muss erreichbar sein
   - Port 587 (SMTP TLS) als Alternative

### "Namen geladen" erscheint mehrfach

✅ Behoben in aktueller Version (wird nur einmal beim Start geladen)

### PDF-Buttons haben unterschiedliche Größen

✅ Behoben in aktueller Version (alle Buttons sind jetzt identisch)

### Empfänger sehen sich gegenseitig in E-Mails

✅ Behoben in aktueller Version (BCC statt TO - DSGVO-konform)

### Umlaute (ä, ö, ü) in PDFs falsch

✅ Behoben in aktueller Version (UTF-8 Normalisierung)

## 🔒 Sicherheit & Datenschutz

- ✅ **BCC E-Mail-Versand:** Empfänger sehen sich nicht (DSGVO)
- ✅ **Lokaler Betrieb:** Keine Internet-Verbindung nötig
- ✅ **Private Repository:** Nicht öffentlich zugänglich
- ✅ **Passwortschutz:** PDF-Löschung nur mit Passwort
- ⚠️ **HTTPS:** Bei Internet-Betrieb HTTPS einrichten!
- ⚠️ **Starke Passwörter:** Für DELETE_PASSWORD und SMTP

**Niemals committen:**
- `.env` Dateien
- SMTP-Zugangsdaten
- Passwörter
- Produktionsdaten

## 📊 Aktuelle Version

**Branch:** `deploy` (für Produktion)
**Letzte Updates:**
- ✅ BCC E-Mail-Versand (Issue #25)
- ✅ UTF-8 Support für PDFs (Umlaute)
- ✅ Bereinigte Backend-Logs
- ✅ Radio-Button-Größen für Mobile (Issue #22)
- ✅ Einheitliche PDF-Button-Größen (Issue #20)
- ✅ Bis zu 50 Fahrzeuge unterstützt

## 📞 Support

Bei Fragen oder Problemen:
1. Prüfe die Logs in Portainer
2. Siehe Troubleshooting-Sektion oben
3. Kontaktiere das Entwicklerteam

---

## 📄 Lizenz

**Private Repository - Nur für interne Nutzung der Feuerwehr Frechen.**

Dieses System ist für den Einsatz im lokalen Netzwerk konzipiert. Für Internet-Betrieb zusätzliche Sicherheitsmaßnahmen implementieren (HTTPS, Authentication, Firewall, etc.).
