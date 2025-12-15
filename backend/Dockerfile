FROM node:18-alpine

WORKDIR /app

# Installiere nur notwendige Build-Dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    ttf-dejavu \
    ttf-droid \
    ttf-freefont \
    ttf-liberation

# Kopiere package.json und package-lock.json
COPY package*.json ./

# Installiere Dependencies
RUN npm install --production

# Kopiere Anwendungscode und public Ordner
COPY server.js ./
COPY public/ ./public/

# Kopiere Entrypoint-Script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Erstelle Verzeichnis für Datenbank und setze Schreibrechte
RUN mkdir -p /app/data && chmod 777 /app/data

# Erstelle einen unprivilegierten Benutzer
# Note: USER directive is commented out because portainer-stack.yml uses user: "0:0"
# to ensure proper file permissions in mounted volumes
RUN adduser -D appuser
RUN chown -R appuser:appuser /app
# USER appuser 

# Exponiere Port
EXPOSE 3000

# Health Check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Starte Anwendung
ENTRYPOINT ["/entrypoint.sh"]
