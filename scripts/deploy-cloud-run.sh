#!/usr/bin/env bash
# Builds Truce's image with Cloud Build and deploys it to Cloud Run.
#
#   bash scripts/deploy-cloud-run.sh            # service "truce" in project truce-disputes
#
# Needs an authenticated gcloud with access to the project. The keys stay in Secret Manager and
# reach the service as environment variables at runtime; they never enter the image.
set -euo pipefail

PROJECT="${TRUCE_GCP_PROJECT:-truce-disputes}"
REGION="${TRUCE_REGION:-us-central1}"
SERVICE="${TRUCE_SERVICE:-truce}"
REPO="${TRUCE_REPO:-truce}"
RUNTIME_SA="truce-runtime@${PROJECT}.iam.gserviceaccount.com"
TAG="$(date -u +%y%m%d-%H%M%S)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/truce:${TAG}"

log() { printf '\033[1m[deploy]\033[0m %s\n' "$*"; }
g() { gcloud "$@" --project "$PROJECT" --quiet; }

# One-time set-up: the image repository and the identity the service runs as.
if ! g artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1; then
  log "creating Artifact Registry repository ${REPO}"
  g artifacts repositories create "$REPO" --repository-format docker --location "$REGION"
fi
if ! g iam service-accounts describe "$RUNTIME_SA" >/dev/null 2>&1; then
  log "creating service account ${RUNTIME_SA}"
  g iam service-accounts create truce-runtime --display-name "Truce runtime"
  for role in roles/datastore.user roles/secretmanager.secretAccessor; do
    g projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:${RUNTIME_SA}" \
      --role "$role" >/dev/null
  done
fi

log "building ${IMAGE}"
g builds submit --tag "$IMAGE" .

# Mount each secret that exists.
secret() { g secrets describe "$2" >/dev/null 2>&1 && printf '%s=%s:latest,' "$1" "$2"; }
SECRETS="$(secret NEBIUS_API_KEY truce-nebius-api-key)$(secret PAYPAL_CLIENT_ID truce-paypal-client-id)$(secret PAYPAL_CLIENT_SECRET truce-paypal-client-secret)$(secret TAVILY_API_KEY truce-tavily-api-key)$(secret TRUCE_OWNER_KEY truce-owner-key)$(secret TRUCE_JOB_KEY truce-job-key)"

URL="$(g run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)' 2>/dev/null || true)"
log "deploying ${SERVICE}"
g run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --service-account "$RUNTIME_SA" \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 \
  --memory 1Gi \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 4 \
  --set-env-vars "TRUCE_GCP_PROJECT=${PROJECT},SITE_URL=${SITE_URL:-${URL:-}}" \
  --set-secrets "${SECRETS%,}"

URL="$(g run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')"
log "live at ${URL}"
