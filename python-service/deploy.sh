#!/bin/bash
set -e

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID environment variable}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-usps-address-validation}"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "Building container image..."
gcloud builds submit --tag "${IMAGE_NAME}" .

echo "Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_NAME}" \
  --region "${REGION}" \
  --platform managed \
  --port 8080 \
  --allow-unauthenticated \
  --set-env-vars "USPS_API_KEY=${USPS_API_KEY:-mock}"

echo "Deployment complete. Service URL:"
gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --format "value(status.url)"
