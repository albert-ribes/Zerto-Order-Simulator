FROM nginx:alpine

COPY . /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Dev default: Docker compose network IP. Override for prod:
#   docker run -e BACKEND_URL=http://10.20.0.147:8000 ...
ENV BACKEND_URL=http://172.30.0.30:8000
