FROM nginx:alpine

COPY html/ /var/www/hdm-frontend/
COPY nginx/hdm-frontend.conf.template /etc/nginx/templates/default.conf.template

ENV BACKEND_URL=http://127.0.0.1:8001
