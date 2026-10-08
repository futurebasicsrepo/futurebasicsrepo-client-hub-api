# Static hosting for the concept site (Railway sets $PORT).
FROM caddy:2.8-alpine
COPY Caddyfile /etc/caddy/Caddyfile
# .dockerignore keeps build files and README.md out of /srv; the Caddyfile also hides them
COPY . /srv
