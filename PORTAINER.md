# 🐳 Portainer Deployment Guide

Anleitung zum Deployen des Feuerwehr Berichte Systems über Portainer mit Git Auto-Build.

## 📋 Voraussetzungen

- Portainer installiert und läuft
- GitHub Fine-Grained Token mit Repository-Zugriff (siehe [GITHUB-TOKEN-GUIDE.md](./GITHUB-TOKEN-GUIDE.md))

## 🚀 Deployment mit Git Auto-Build

Portainer pullt die Dateien direkt von GitHub und baut die Images automatisch.

### Schritt 1: Stack aus Git Repository erstellen

1. In Portainer einloggen
2. Zu **Stacks** navigieren
3. **Add stack** klicken
4. Stack-Name eingeben: `feuerwehr-berichte`
5. **Repository** als Build-Methode auswählen

### Schritt 2: Git Repository konfigurieren

```
Repository URL: https://github.com/FF-Frechen/Berichte
Repository reference: refs/heads/main

✓ Authentication aktivieren
Username: dein-github-username
Personal Access Token: ghp_xxxxxxxxxxxx

Compose path: portainer-stack.yml
```

> **💡 Token erstellen:** Der Token braucht nur `Contents: Read` Permission - siehe [GITHUB-TOKEN-GUIDE.md](./GITHUB-TOKEN-GUIDE.md)

### Schritt 3: Umgebungsvariablen konfigurieren

Scrolle zu **Environment variables** und füge folgende Variablen hinzu:

#### Variante 1: Mit Host-Pfad (Bind Mount)

```env
# Pfad zum Datenverzeichnis auf dem Host
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

#### Variante 2: Mit Docker Named Volume (Empfohlen)

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

> **📝 Template:** Alle benötigten Variablen findest du in `.env.portainer.example`

### Schritt 4: Stack deployen

1. Klicke auf **Deploy the stack**
2. ⏱️ **Erster Build dauert 5-10 Minuten**
   - Portainer pullt das Repository von GitHub
   - Portainer baut Backend-Image (~3-5 Min)
   - Portainer baut Frontend-Image (~1-2 Min)
   - Build-Logs werden in Echtzeit angezeigt
3. Nach erfolgreichem Build starten die Container automatisch
4. Fertig! ✅

### Schritt 5: Updates deployen

Um auf eine neue Version zu aktualisieren:

1. Code auf GitHub pushen (neues Feature, Bugfix, etc.)
2. In Portainer: Stack öffnen
3. **Pull and redeploy** klicken
4. Portainer pullt die neueste Version von GitHub, baut neu und startet die Container

**Das war's!** Keine manuellen Builds, keine Image-Registry nötig.

---

## 🔧 Zugriff

Nach dem Deployment ist die Anwendung unter **Port 8080** erreichbar:

```
http://server-ip:8080
```

---

## 📦 Volumes verwalten

### PDFs im Named Volume ablegen

Wenn du Variante 2 (Named Volume) verwendest:

```bash
# Volume inspizieren
docker volume inspect feuerwehr-berichte_feuerwehr-config

# Dateien ins Volume kopieren
docker run --rm -v feuerwehr-berichte_feuerwehr-config:/data -v $(pwd):/host alpine sh -c "mkdir -p /data/pdfs && cp /host/*.pdf /data/pdfs/"
```

### PDFs aus dem Named Volume abrufen

```bash
docker run --rm -v feuerwehr-berichte_feuerwehr-config:/data -v $(pwd):/host alpine cp -r /data/pdfs /host/
```

---

## 🔄 Stack aktualisieren

### Environment-Variablen ändern

1. Stack öffnen → **Editor**
2. Variablen anpassen
3. **Update the stack**

### Code-Updates deployen

1. Code auf GitHub pushen
2. In Portainer: Stack → **Pull and redeploy**
3. Fertig! ✅

---

## 🔍 Troubleshooting

### Logs prüfen

Portainer → **Containers** → Container auswählen → **Logs**

### Häufige Probleme

**"Build failed"**
- Prüfe Build-Logs in Portainer
- Stelle sicher dass GitHub Token korrekt ist
- Prüfe Internetverbindung

**"Cannot connect to backend"**
- Prüfe Backend-Logs
- Warte bis Health-Check erfolgreich (~60 Sek)
- Prüfe Environment-Variablen

**"SMTP Error"**
- Überprüfe SMTP-Zugangsdaten
- Prüfe Port-Erreichbarkeit

---

## 🔒 Sicherheit

- **GitHub Token** sicher aufbewahren, niemals committen
- **Secrets** nur über Environment Variables setzen
- **Starke Passwörter** verwenden
- Für Produktion: HTTPS, Auth, Firewall, Backups

---

## 🔗 Weitere Dokumentation

- [GITHUB-TOKEN-GUIDE.md](./GITHUB-TOKEN-GUIDE.md) - Token Setup
- [README.md](./README.md) - Übersicht
- [.env.portainer.example](./.env.portainer.example) - Variablen Template

---

**Bei Fragen:** Siehe README.md
