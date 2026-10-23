FROM nginx:alpine

# Build context: /opt/zerto/hospital/hdm-observability-src/
# Dashboard HTML is in html/ subdirectory (root index.html is nginx placeholder)
COPY html/ /usr/share/nginx/html/
COPY nginx/hdm-obs.conf.template /etc/nginx/templates/default.conf.template
