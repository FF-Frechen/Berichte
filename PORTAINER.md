# 🐳 Portainer Deployment Guide

Anleitung zum Deployen des Feuerwehr Berichte Systems über Portainer.

## 📋 Voraussetzungen

- Portainer installiert und läuft
- Docker Images gebaut und verfügbar:
  - `feuerwehr-backend:latest`
  - `feuerwehr-frontend:latest`

## 🚀 Deployment-Schritte

### 1. Stack erstellen

1. In Portainer einloggen
2. Zu **Stacks** navigieren
3. **Add stack** klicken
4. Stack-Name eingeben (z.B. `feuerwehr-berichte`)

### 2. Stack-Konfiguration einfügen

Kopiere den Inhalt von `portainer-stack.yml` in den Web Editor.

### 3. Umgebungsvariablen konfigurieren

Scrolle zu **Environment variables** und füge folgende Variablen hinzu:

#### Option A: Mit Host-Pfad (Bind Mount)

Wenn du ein bestehendes Verzeichnis auf dem Host verwenden möchtest:

```env
# Pfad zum Einsatzdoku-Verzeichnis auf dem Host
CONFIG_PATH=/pfad/zum/verzeichnis/Einsatzdoku

# SMTP-Konfiguration
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=deine-email@example.com
SMTP_PASS=dein-passwort

# Sicherheit
DELETE_PASSWORD=dein-lösch-passwort

# E-Mail-Empfänger
EMAIL_RECIPIENTS=empfaenger1@example.com,empfaenger2@example.com
EMAIL_RECIPIENTS_ANWESENHEIT=empfaenger1@example.com

# Namensliste (komma-getrennt)
NAMEN=Max Mustermann,Erika Musterfrau,Hans Schmidt
```

#### Option B: Mit Docker Named Volume (Empfohlen)

Wenn du Docker Volumes verwenden möchtest (portabel zwischen Servern):

```env
# CONFIG_PATH nicht setzen (nutzt automatisch 'feuerwehr-config' Volume)

# SMTP-Konfiguration
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=deine-email@example.com
SMTP_PASS=dein-passwort

# Sicherheit
DELETE_PASSWORD=dein-lösch-passwort

# E-Mail-Empfänger
EMAIL_RECIPIENTS=empfaenger1@example.com,empfaenger2@example.com
EMAIL_RECIPIENTS_ANWESENHEIT=empfaenger1@example.com

# Namensliste (komma-getrennt)
NAMEN=Max Mustermann,Erika Musterfrau,Hans Schmidt
```

> **Hinweis:** Wenn `CONFIG_PATH` nicht gesetzt ist, wird automatisch ein Docker Volume namens `feuerwehr-config` verwendet.

### 4. Stack deployen

Klicke auf **Deploy the stack**.

## 🔧 Portspezifischer Zugriff

Nach dem Deployment ist die Anwendung unter **Port 8080** erreichbar:

```
http://server-ip:8080
```

## 📦 Volumes verwalten

### PDFs im Named Volume ablegen

Wenn du Option B verwendest und PDFs ins Volume kopieren möchtest:

```bash
# Volume inspizieren
docker volume inspect feuerwehr-berichte_feuerwehr-config

# Temporären Container starten um Dateien zu kopieren
docker run --rm -v feuerwehr-berichte_feuerwehr-config:/data -v $(pwd):/host alpine sh -c "mkdir -p /data/pdfs && cp /host/*.pdf /data/pdfs/"
```

### PDFs aus dem Named Volume abrufen

```bash
# PDFs aus dem Volume kopieren
docker run --rm -v feuerwehr-berichte_feuerwehr-config:/data -v $(pwd):/host alpine cp -r /data/pdfs /host/
```

## 🔄 Stack aktualisieren

### Environment-Variablen ändern

1. Zum Stack navigieren
2. **Editor** klicken
3. Variablen anpassen
4. **Update the stack** klicken

### Images aktualisieren

```bash
# Neue Images bauen und in Registry pushen
docker build -t feuerwehr-backend:latest ./backend
docker build -t feuerwehr-frontend:latest -f nginx/Dockerfile .

# In Portainer: Stack → Pull and redeploy
```

## 🔍 Troubleshooting

### Logs prüfen

In Portainer:
1. Zu **Containers** navigieren
2. Container auswählen (`feuerwehr-backend` oder `feuerwehr-nginx`)
3. **Logs** klicken

### Container Status prüfen

In Portainer unter **Stacks** → Stack-Name → **Containers** siehst du:
- ✅ Grün: Container läuft
- 🔴 Rot: Container gestoppt/fehler

### Häufige Probleme

#### "Cannot connect to backend"
- Prüfe ob Backend-Container läuft
- Prüfe Backend-Logs auf Fehler
- Stelle sicher, dass Health-Check erfolgreich ist

#### "SMTP Error" im Backend
- Überprüfe SMTP-Zugangsdaten in Environment-Variablen
- Prüfe ob Port 587 (oder dein SMTP-Port) erreichbar ist

#### "Volume not found"
- Stelle sicher, dass Volume-Name korrekt ist
- Bei Named Volumes: automatisch beim Stack-Start erstellt
- Bei Bind Mounts: Verzeichnis muss existieren

## 🔒 Sicherheitshinweise

1. **Niemals** sensitive Daten in die `portainer-stack.yml` schreiben
2. Alle Secrets nur über **Environment Variables** in Portainer setzen
3. Verwende starke Passwörter für `DELETE_PASSWORD`
4. Bei Produktivbetrieb:
   - HTTPS einrichten (z.B. mit Traefik/Caddy)
   - Authentifizierung implementieren
   - Firewall-Regeln konfigurieren

## 📊 Monitoring

### Healthcheck Status

Der Backend-Container hat einen Health-Check, der alle 30 Sekunden läuft:
- **Healthy**: Backend antwortet auf `/api/health`
- **Unhealthy**: Backend antwortet nicht

Status in Portainer unter **Containers** sichtbar.

## 🔄 Migration zwischen Servern

### Variante 1: Mit Named Volumes

```bash
# Auf altem Server: Volume exportieren
docker run --rm -v feuerwehr-berichte_feuerwehr-data:/data -v $(pwd):/backup alpine tar czf /backup/data-backup.tar.gz -C /data .
docker run --rm -v feuerwehr-berichte_feuerwehr-config:/data -v $(pwd):/backup alpine tar czf /backup/config-backup.tar.gz -C /data .

# Backups zum neuen Server kopieren
scp *.tar.gz user@neuer-server:/pfad/

# Auf neuem Server: Stack deployen, dann Volumes importieren
docker run --rm -v neuer-stack_feuerwehr-data:/data -v $(pwd):/backup alpine tar xzf /backup/data-backup.tar.gz -C /data
docker run --rm -v neuer-stack_feuerwehr-config:/data -v $(pwd):/backup alpine tar xzf /backup/config-backup.tar.gz -C /data
```

### Variante 2: Mit Bind Mounts

Einfach das Verzeichnis auf den neuen Server kopieren und `CONFIG_PATH` entsprechend setzen.

---

**Bei Fragen oder Problemen:** Siehe Hauptdokumentation in `README.md`
