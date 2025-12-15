#!/bin/bash

# Feuerwehr Einsatz-Dokumentation - Build Script für Portainer
# Dieses Script baut die Docker Images und bereitet sie für Portainer vor

set -e

echo "🔨 Baue Backend Image..."
cd backend
docker build -t feuerwehr-backend:latest .
cd ..

echo "🔨 Baue Frontend & Nginx Image..."
docker build -f Dockerfile.frontend -t feuerwehr-frontend:latest .

echo ""
echo "✅ Images erfolgreich gebaut!"
echo ""
echo "📦 Verfügbare Images:"
docker images | grep feuerwehr

echo ""
echo "📝 Nächste Schritte für Portainer:"
echo ""
echo "1. LOKALE REGISTRY (wenn keine externe Registry):"
echo "   docker run -d -p 5000:5000 --restart=always --name registry registry:2"
echo "   docker tag feuerwehr-backend:latest localhost:5000/feuerwehr-backend:latest"
echo "   docker tag feuerwehr-frontend:latest localhost:5000/feuerwehr-frontend:latest"
echo "   docker push localhost:5000/feuerwehr-backend:latest"
echo "   docker push localhost:5000/feuerwehr-frontend:latest"
echo ""
echo "2. ODER: Images direkt auf Portainer-Server kopieren:"
echo "   docker save feuerwehr-backend:latest | gzip > feuerwehr-backend.tar.gz"
echo "   docker save feuerwehr-frontend:latest | gzip > feuerwehr-frontend.tar.gz"
echo "   # Auf Server: docker load < feuerwehr-backend.tar.gz"
echo ""
echo "3. In Portainer:"
echo "   - Stacks -> Add Stack"
echo "   - Web editor -> portainer-stack.yml einfügen"
echo "   - Deploy"
echo ""
