FROM nginx:alpine

# Build context must be the project root (context: . in docker-compose)
# Shared static assets from frontend
COPY processed-meat/pm-frontend/css /usr/share/nginx/html/css
COPY processed-meat/pm-frontend/js/i18n.js /usr/share/nginx/html/js/i18n.js
COPY processed-meat/pm-frontend/js/api.js /usr/share/nginx/html/js/api.js
COPY processed-meat/pm-frontend/js/charts.js /usr/share/nginx/html/js/charts.js

# Observability-specific files
COPY processed-meat/pm-observability/index.html /usr/share/nginx/html/index.html
COPY processed-meat/pm-observability/js/app.js /usr/share/nginx/html/js/app.js
COPY processed-meat/pm-observability/nginx.conf.template /etc/nginx/templates/default.conf.template
