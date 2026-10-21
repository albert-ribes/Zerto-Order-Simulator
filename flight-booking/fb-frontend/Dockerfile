FROM nginx:alpine

COPY . /var/www/flight-booking-frontend/
COPY nginx/flight-booking-frontend.conf.template /etc/nginx/templates/default.conf.template

ENV BACKEND_URL=http://127.0.0.1:8002
