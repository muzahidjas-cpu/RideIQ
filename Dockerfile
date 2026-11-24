FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build
ENV NODE_ENV=production MCP_TRANSPORT=streamable-http PORT=56181
EXPOSE 56181
CMD ["sh", "-c", "npm run prisma:migrate && npm run start:http"]
