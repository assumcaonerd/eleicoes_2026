FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
RUN apk add --no-cache python3 py3-pip && pip3 install --break-system-packages asn1tools
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/schema.sql ./dist/src/db/schema.sql
COPY --from=build /app/spec ./spec
EXPOSE 8787
CMD ["node", "dist/src/server.js"]
