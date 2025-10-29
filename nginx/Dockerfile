FROM nginx:1.27-alpine
# Copy our nginx config
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
# Copy static assets from the server's public folder at build time
COPY server/public /usr/share/nginx/html
# Expose the port nginx listens on
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
