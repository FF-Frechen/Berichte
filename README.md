# Feuerwehr Berichte System

Ein Docker-basiertes System zur Verwaltung von Einsatzberichten und Anwesenheitslisten für die Feuerwehr.

## 📋 Features

- 📝 Einsatzberichte erstellen und als PDF speichern
- 👥 Anwesenheitslisten erfassen
- 📧 Automatischer E-Mail-Versand der Berichte
- 🗄️ SQLite-Datenbank zur Datenspeicherung
- 🐳 Vollständig containerisiert mit Docker

## 🚀 Schnellstart

### Voraussetzungen

- Docker & Docker Compose installiert
- Git installiert

### Installation

1. **Repository klonen:**
   ```bash
   git clone https://github.com/FF-Frechen/Berichte.git
   cd Berichte
   ```

2. **Umgebungsvariablen konfigurieren:**

   Kopiere die Beispieldatei und fülle sie mit deinen Daten:
   ```bash
   cp .env.example .env
   ```

   Bearbeite die `.env` Datei mit deinen Daten:
   - SMTP-Zugangsdaten für E-Mail-Versand
   - E-Mail-Empfänger
   - Passwörter
   - Liste der Feuerwehrmitglieder (Komma-getrennt)

3. **Docker Container starten:**
   ```bash
   docker-compose up -d
   ```

4. **Anwendung öffnen:**
   
   Öffne deinen Browser und navigiere zu: `http://localhost`

## 📁 Projektstruktur

```
Berichte/
├── backend/              # Node.js Backend
│   ├── server.js        # Express Server
│   ├── package.json     # Dependencies
│   └── Dockerfile       # Backend Container
├── frontend/            # HTML Frontend
│   ├── index.html       # Hauptseite
│   ├── anwesenheit.html # Anwesenheitsliste
│   ├── Doku.html        # Dokumentation
│   └── input_doku.html  # Eingabeformular
├── nginx/               # NGINX Konfiguration
│   └── nginx.conf       # Reverse Proxy Config
├── docker-compose.yml   # Docker Orchestrierung
└── .env                 # Konfiguration (nicht im Repo!)
```

## ⚙️ Konfiguration

Alle Einstellungen befinden sich in der `.env` Datei:

```env
# SMTP-Konfiguration
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=deine-email@example.com
SMTP_PASS=dein-passwort

# Sicherheit
DELETE_PASSWORD=pdf-lösch-passwort

# E-Mail-Empfänger
EMAIL_RECIPIENTS=empfaenger1@example.com,empfaenger2@example.com
EMAIL_RECIPIENTS_ANWESENHEIT=empfaenger1@example.com

# Namensliste
NAMEN=Max Mustermann,Erika Musterfrau,Hans Schmidt
```

> **💡 Tipp:** Diese Datei wird automatisch von `docker-compose.yml` geladen.

## 🔧 Docker Befehle

```bash
# Container starten
docker-compose up -d

# Container stoppen
docker-compose down

# Logs anzeigen
docker-compose logs -f

# Container neu bauen
docker-compose up -d --build

# Status prüfen
docker-compose ps
```

## 📦 Portainer Deployment

Das Projekt kann direkt aus GitHub in Portainer deployed werden! 🚀

**Für detaillierte Anweisungen siehe:** [PORTAINER.md](./PORTAINER.md)

### 🔥 Empfohlene Methode: Git Auto-Build

Portainer pullt die Dateien direkt von GitHub und baut die Images automatisch.

1. **In Portainer:** Stacks → Add stack → **Repository**

2. **Repository konfigurieren:**
   ```
   Repository URL: https://github.com/FF-Frechen/Berichte
   Branch: refs/heads/main
   Compose path: portainer-stack.yml
   Authentication: GitHub Token (siehe GITHUB-TOKEN-GUIDE.md)
   ```

3. **Environment-Variablen setzen** (siehe `.env.portainer.example`)

4. **Deploy the stack** - fertig! ✅

**Vorteile:**
- ✅ Keine manuellen Builds nötig
- ✅ Updates mit einem Klick (**Pull and redeploy**)
- ✅ Vollautomatischer Build aus GitHub

Die Konfiguration ist **universell verwendbar** und nicht an einen bestimmten Serverpfad gebunden!

## 🔒 Sicherheitshinweise

- **Niemals** `.env` in Git committen!
- `.gitignore` schützt diese Datei automatisch
- Verwende starke Passwörter für `DELETE_PASSWORD`
- Ändere regelmäßig die SMTP-Zugangsdaten

## 🐛 Troubleshooting

### Container startet nicht
```bash
# Logs prüfen
docker-compose logs backend
docker-compose logs nginx

# Container neu starten
docker-compose restart
```

### E-Mail-Versand funktioniert nicht
- Prüfe SMTP-Zugangsdaten in `.env.smtp`
- Prüfe Firewall-Einstellungen (Port 587)
- Kontrolliere Backend-Logs: `docker-compose logs backend`

### Datenbank-Fehler
- Stelle sicher, dass das `data/` Verzeichnis existiert
- Prüfe Schreibrechte: `chmod -R 755 data/`

## 📄 Lizenz

Dieses Projekt ist für den internen Gebrauch der Feuerwehr Frechen bestimmt.

## 👥 Support

Bei Fragen oder Problemen wende dich an das Entwicklerteam.

---

**Hinweis:** Dieses System ist für den Einsatz im lokalen Netzwerk konzipiert. Für den Produktivbetrieb im Internet sollten zusätzliche Sicherheitsmaßnahmen implementiert werden (HTTPS, Authentication, etc.).
