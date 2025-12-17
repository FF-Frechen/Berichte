# GitHub Actions Workflows

## Docker Build Workflow

Baut automatisch private Docker Images für Backend und Frontend.

### Trigger
- **Push zu `main` Branch** → Baut Images mit Tags `main`, `main-<sha>` und `latest`
- **Push zu `test` Branch** → Baut Images mit Tags `test` und `test-<sha>`
- **Manuell** → Via "Actions" Tab → "Run workflow"

### Images
Die Images werden nach **GitHub Container Registry (ghcr.io)** gepusht:
- Backend: `ghcr.io/ff-frechen/berichte/backend`
- Frontend: `ghcr.io/ff-frechen/berichte/frontend`

### 🔒 Privat & Sicher
- **Automatisch privat**, da Repository privat ist
- Nur du (Repository Owner) kannst die Images sehen
- Authentifizierung erforderlich zum Pullen

### Verwendung der Images

#### 1. GitHub Container Registry Login
```bash
# Personal Access Token (PAT) mit 'read:packages' Berechtigung erstellen
echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

#### 2. Images pullen
```bash
# Main Branch Images (latest)
docker pull ghcr.io/ff-frechen/berichte/backend:latest
docker pull ghcr.io/ff-frechen/berichte/frontend:latest

# Test Branch Images
docker pull ghcr.io/ff-frechen/berichte/backend:test
docker pull ghcr.io/ff-frechen/berichte/frontend:test

# Spezifischer Commit
docker pull ghcr.io/ff-frechen/berichte/backend:main-abc1234
```

#### 3. docker-compose.yml anpassen
```yaml
services:
  backend:
    image: ghcr.io/ff-frechen/berichte/backend:latest
    # Kein 'build' mehr nötig

  frontend:
    image: ghcr.io/ff-frechen/berichte/frontend:latest
    # Kein 'build' mehr nötig
```

#### 4. In Portainer verwenden
1. **Registries** → Add Registry
   - Type: Custom Registry
   - Registry URL: `ghcr.io`
   - Username: `dein-github-username`
   - Password: `dein-github-pat`
2. **Stacks** → Deploy
   - Verwende die Image-Namen statt build

### Image Tags
- `latest` - Neueste Version von main Branch
- `main` - Main Branch
- `test` - Test Branch
- `main-abc1234` - Spezifischer Commit (SHA)
- `test-abc1234` - Spezifischer Commit auf test Branch

### Vorteile
- ✅ Automatische Builds bei jedem Push
- ✅ Keine lokalen Builds mehr nötig
- ✅ Schnelleres Deployment (Image bereits gebaut)
- ✅ Versionierung über Tags
- ✅ Cache für schnellere Builds
- 🔒 **Vollständig privat - nur für dich sichtbar**

### Troubleshooting

**Problem: "unauthorized: authentication required"**
```bash
# Lösung: Login mit PAT
echo "YOUR_PAT" | docker login ghcr.io -u YOUR_USERNAME --password-stdin
```

**Problem: "Image not found"**
- Prüfe, ob der Workflow erfolgreich war (Actions Tab)
- Prüfe Groß-/Kleinschreibung im Image-Namen
- Stelle sicher, dass du eingeloggt bist

**Sichtbarkeit prüfen:**
1. GitHub → Packages
2. Finde dein Image
3. Settings → Change visibility → **Private** ✓
