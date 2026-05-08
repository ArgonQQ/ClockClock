FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server.js mailer.js ./
COPY public ./public
COPY scripts ./scripts
VOLUME /app/data
EXPOSE 3000
CMD ["node", "server.js"]
