FROM nginx:alpine

# Build context: /opt/zerto/flight-booking/fb-observer-src/
# Dashboard HTML is in frontend/ subdirectory (root index.html is nginx placeholder)
COPY frontend/ /usr/share/nginx/html/
COPY nginx/fb-obs.conf.template /etc/nginx/templates/default.conf.template
