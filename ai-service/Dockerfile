# ai-service/Dockerfile
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies for PDF and Docx processing
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose AI service port
EXPOSE 8001

# Start FastAPI service
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
