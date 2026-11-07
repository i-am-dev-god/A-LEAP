FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 SHORTS_DATA_DIR=/data HOST=0.0.0.0 PORT=8000
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend
COPY frontend ./frontend
COPY main.py .
VOLUME /data
EXPOSE 8000
CMD ["python", "main.py"]
