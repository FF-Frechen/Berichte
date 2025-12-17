
FROM nginx:alpine

# Kopiere Nginx-Konfiguration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Kopiere Frontend-Dateien
COPY ./ /usr/share/nginx/html

# Setze Rechte
RUN chmod -R 755 /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
