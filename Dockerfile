FROM nginx:1.27-alpine

COPY assets /usr/share/nginx/html/assets
COPY regime /usr/share/nginx/html/regime


RUN printf 'server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
    location / { try_files $uri $uri/ =404; }\n\
    location ~* \\.(js|css|png|svg|csv)$ { expires 1d; add_header Cache-Control "public"; }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/regime/ || exit 1
