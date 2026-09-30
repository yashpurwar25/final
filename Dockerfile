FROM node:22-bookworm-slim AS frontend
WORKDIR /app/dashboard
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/ ./
COPY dashbard_timesxript_drivability/ /app/dashbard_timesxript_drivability/
RUN npm run build

FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY new-claude-sih-v2.ipynb ./
COPY --from=frontend /app/dashboard/dist ./dashboard/dist
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
