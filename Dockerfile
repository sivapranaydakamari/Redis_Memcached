# Dockerfile - builds the Product Catalog API image.
# Kept tiny on purpose: copy package files first so "npm install" is
# cached by Docker as long as dependencies don't change, then copy code.
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

EXPOSE 3000

CMD ["node", "src/server.js"]
