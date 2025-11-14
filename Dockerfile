FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source files
COPY . .

# Build TypeScript
RUN npm run build

# Start server
CMD ["node", "dist/server.js"]

