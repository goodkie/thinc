FROM node:20-alpine
WORKDIR /app
COPY webapp/package*.json ./
RUN npm install
COPY webapp/ ./
EXPOSE 8080
ENV PORT=8080
CMD ["node", "server.js"]
