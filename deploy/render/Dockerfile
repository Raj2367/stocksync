FROM node:20-alpine AS builder

WORKDIR /app

# --- API Gateway ---
COPY services/api-gateway/package.json services/api-gateway/package-lock.json ./services/api-gateway/
RUN cd services/api-gateway && npm ci
COPY services/api-gateway/ ./services/api-gateway/
RUN cd services/api-gateway && npm run build

# --- Order Service ---
COPY services/order-service/package.json services/order-service/package-lock.json ./services/order-service/
RUN cd services/order-service && npm ci
COPY services/order-service/ ./services/order-service/
RUN cd services/order-service && npm run build

# --- Inventory Service ---
COPY services/inventory-service/package.json services/inventory-service/package-lock.json ./services/inventory-service/
RUN cd services/inventory-service && npm ci
COPY services/inventory-service/ ./services/inventory-service/
RUN cd services/inventory-service && npm run build

# --- Payment Service ---
COPY services/payment-service/package.json services/payment-service/package-lock.json ./services/payment-service/
RUN cd services/payment-service && npm ci
COPY services/payment-service/ ./services/payment-service/
RUN cd services/payment-service && npm run build

# --- Saga Orchestrator ---
COPY services/saga-orchestrator/package.json services/saga-orchestrator/package-lock.json ./services/saga-orchestrator/
RUN cd services/saga-orchestrator && npm ci
COPY services/saga-orchestrator/ ./services/saga-orchestrator/
RUN cd services/saga-orchestrator && npm run build
