# backend/Dockerfile
FROM node:20-slim

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install dependencies (production-ready)
RUN npm install

# Copy application code
COPY . .

# Expose backend port
EXPOSE 5000

# Start with dev server (supports hot reload via volume)
CMD ["npm", "run", "dev"]
