# Static hosting for the concept site (Railway sets $PORT).
FROM caddy:2.8-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY . /srv
RUN rm -f /srv/Dockerfile /srv/Caddyfile /srv/build.mjs /srv/README.md
