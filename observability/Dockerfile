FROM nginx:alpine

# Build context must be the project root (context: . in docker-compose)
# Shared static assets from frontend
COPY frontend/css /usr/share/nginx/html/css
COPY frontend/js/i18n.js /usr/share/nginx/html/js/i18n.js
COPY frontend/js/api.js /usr/share/nginx/html/js/api.js
COPY frontend/js/charts.js /usr/share/nginx/html/js/charts.js

# Observability-specific files
COPY observability/index.html /usr/share/nginx/html/index.html
COPY observability/js/app.js /usr/share/nginx/html/js/app.js
COPY observability/nginx.conf /etc/nginx/conf.d/default.conf
