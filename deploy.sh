#!/bin/bash
# SIA.Sat - Workshop Registration System
# Docker Deployment Script for 192.168.0.111

set -e

echo "========================================"
echo "SIA.Sat - Workshop Registration System"
echo "Docker Deployment on 192.168.0.111"
echo "========================================"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "[ERROR] Docker is not running. Please start Docker."
    exit 1
fi

echo "[INFO] Docker is running..."
echo ""

# Stop and remove existing containers
echo "[STEP 1/4] Stopping existing containers..."
docker compose down -v
echo ""

# Start services (with build to ensure fresh images)
echo "[STEP 2/4] Starting services..."
docker compose up -d --build
echo ""

# Wait for services to be healthy
echo "[STEP 3/4] Waiting for services to be ready..."
sleep 10
echo ""

# Show status
echo "[STEP 4/4] Checking service status..."
docker compose ps
echo ""

echo "========================================"
echo "Deployment Complete!"
echo "========================================"
echo ""
echo "Frontend:  http://192.168.0.111"
echo "Backend:   http://192.168.0.111:8080"
echo "Jaeger UI: http://192.168.0.111:8888"
echo ""
echo "To view logs: docker compose logs -f"
echo "To stop:      docker compose down"
echo "========================================"
