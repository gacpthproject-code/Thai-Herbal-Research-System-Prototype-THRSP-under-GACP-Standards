---
name: cloud-run
description: Deploy and manage Cloud Run services, jobs, and worker pools. Use when deploying containerized applications, running batch jobs, or managing pull-based background workers on Google Cloud.
---

# Cloud Run

Fully managed platform for deploying containers, running batch jobs, and handling background workloads on Google Cloud.

## When to Use This Skill

- Deploying a web application or API to Cloud Run
- Creating scheduled or event-triggered batch jobs
- Setting up pull-based background workers (Kafka, Pub/Sub)
- Troubleshooting Cloud Run deployment failures
- Configuring Cloud Run scaling, networking, or security

## Resource Types

| Type | Use Case | Behavior |
|------|----------|----------|
| **Service** | HTTP APIs, web apps, webhooks | Autoscales to zero, responds to HTTP requests |
| **Job** | Data processing, migrations, reports | Runs to completion, manual or scheduled |
| **Worker Pool** | Kafka consumers, Pub/Sub pull, RabbitMQ | Always-on, pull-based background processing |

## Prerequisites

```bash
# Enable required APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

# Grant Cloud Build the builder role
gcloud projects add-iam-policy-binding PROJECT_ID \
    --member=serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com \
    --role=roles/run.builder
```

### Required IAM Roles

- `roles/run.admin` — Full Cloud Run management
- `roles/run.sourceDeveloper` — Deploy from source
- `roles/iam.serviceAccountUser` — Use service identities
- `roles/logging.viewer` — Read deployment logs

## Deploy a Service

### CRITICAL: Port Configuration

Any deployed code MUST listen on `0.0.0.0` (not `127.0.0.1`) and use the `$PORT` environment variable (defaults to 8080), or it will crash on boot.

### From Container Image

```bash
gcloud run deploy SERVICE_NAME \
    --image IMAGE_URL \
    --region us-central1 \
    --allow-unauthenticated
```

### From Source Code (Buildpacks)

```bash
gcloud run deploy SERVICE_NAME --source .
```

With automatic base image updates:

```bash
gcloud run deploy SERVICE_NAME --source . \
    --base-image BASE_IMAGE \
    --automatic-updates
```

### From Source Without Build (Preview)

```bash
gcloud beta run deploy SERVICE_NAME \
    --source . \
    --no-build \
    --base-image=BASE_IMAGE \
    --command=COMMAND
```

## Create and Run Jobs

### Create a Job

```bash
gcloud run jobs create JOB_NAME \
    --image IMAGE_URL \
    --tasks=10 \
    --max-retries=3 \
    --task-timeout=600s \
    --parallelism=5
```

### Execute a Job

```bash
# Fire and forget
gcloud run jobs execute JOB_NAME

# Wait for completion
gcloud run jobs execute JOB_NAME --wait --region=REGION
```

### Job Options

| Option | Description | Default |
|--------|-------------|---------|
| `--tasks` | Number of tasks (1-10000) | 1 |
| `--max-retries` | Retries per failed task (0-10) | 3 |
| `--task-timeout` | Max time per task | 10 min |
| `--parallelism` | Max concurrent tasks | All at once |
| `--execute-now` | Run immediately after creation | false |

## Deploy Worker Pools

### From Container Image

```bash
gcloud run worker-pools deploy WORKER_POOL_NAME --image IMAGE_URL
```

### From Source Code

```bash
gcloud run worker-pools deploy WORKER_POOL_NAME --source .
```

## Common Operations

### View Logs

```bash
gcloud logging read "resource.labels.service_name=SERVICE_NAME" --limit=50
```

### List Services

```bash
gcloud run services list --region=REGION
```

### Update Configuration

```bash
gcloud run services update SERVICE_NAME \
    --memory=512Mi \
    --cpu=1 \
    --min-instances=1 \
    --max-instances=10 \
    --concurrency=80 \
    --timeout=300s
```

### Set Environment Variables

```bash
gcloud run services update SERVICE_NAME \
    --set-env-vars="KEY1=VALUE1,KEY2=VALUE2"
```

### Map Custom Domain

```bash
gcloud run domain-mappings create \
    --service SERVICE_NAME \
    --domain CUSTOM_DOMAIN \
    --region REGION
```

## Troubleshooting

| Problem | Diagnosis | Solution |
|---------|-----------|----------|
| Crash on boot / healthcheck failed | Fetch logs: `gcloud logging read "resource.labels.service_name=SERVICE_NAME" --limit=20` | Ensure app listens on `0.0.0.0:$PORT` |
| IAM/Permission error | Missing roles | See Required IAM Roles section above |
| Native dependency error | Wrong architecture | Switch from `--no-build` to `--source .` (Buildpacks) |
| Cold start too slow | Container startup time | Set `--min-instances=1` to keep warm instances |
| Timeout errors | Request takes too long | Increase `--timeout` (max 3600s for services) |
