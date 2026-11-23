FROM node:20-alpine

# ADB para hablar con los sticks
RUN apk add --no-cache android-tools

WORKDIR /app

# Codigo
COPY backend/ /app/backend/
COPY frontend/ /app/frontend/

# Volumenes:
# /data: catalogos del usuario + APKs cacheados + logs. Persistente.
VOLUME ["/data"]
ENV FIREPANEL_DATA=/data
ENV FIREPANEL_PUERTO=17892

EXPOSE 17892

CMD ["node", "/app/backend/backend.mjs"]
