FROM node:20-alpine

WORKDIR /app

# Copy shared constants and backend files
COPY shared ./shared
COPY backend/package*.json ./backend/

WORKDIR /app/backend
RUN npm install --production

COPY backend .

EXPOSE 4000

ENV PORT=4000
ENV NODE_ENV=production

CMD ["node", "src/server.js"]
