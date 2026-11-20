---
name: gcloud-onboarding
description: Guide developers through their first steps on Google Cloud — account setup, billing, project creation, CLI installation, and deploying a first resource. Use when a user is new to Google Cloud or needs help setting up their environment from scratch.
---

# Google Cloud Onboarding

Step-by-step guide for getting started with Google Cloud, from account creation to deploying your first resource.

## When to Use This Skill

- User is new to Google Cloud and needs help getting started
- User needs to create a Google Cloud project
- User needs to set up billing or activate free credits
- User needs to install and configure the `gcloud` CLI
- User wants to deploy their first Cloud resource

## Prerequisites

- A Google Account (e.g., @gmail.com)
- A valid payment method for billing verification (even for the free trial)

## Step-by-Step Onboarding

### 1. Verify gcloud CLI Installation

Check if the Google Cloud CLI is already installed:

```bash
gcloud version
```

If not installed, guide the user to download from https://cloud.google.com/sdk/docs/install and wait for confirmation before proceeding.

### 2. Authenticate

```bash
gcloud auth login
```

This opens a browser for OAuth authentication. Wait for the user to complete the login flow.

### 3. Create or Select a Project

List existing projects:

```bash
gcloud projects list
```

Create a new project if needed:

```bash
gcloud projects create PROJECT_ID --name="PROJECT_DISPLAY_NAME"
```

Set the active project:

```bash
gcloud config set project PROJECT_ID
```

### 4. Link Billing

Verify billing is linked:

```bash
gcloud billing accounts list
gcloud billing projects describe PROJECT_ID
```

If no billing account is linked, the user must set this up via the Google Cloud Console at https://console.cloud.google.com/billing.

### 5. Enable APIs

Most services require API enablement. Enable commonly needed APIs:

```bash
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

### 6. Deploy a First Resource

Recommend Cloud Run as the simplest first deployment:

```bash
gcloud run deploy hello-world \
    --image=us-docker.pkg.dev/cloudrun/container/hello:latest \
    --region=us-central1 \
    --allow-unauthenticated
```

This deploys a sample container and outputs a public URL.

## Validation Checklist

After onboarding, verify these items:

- **CLI authenticated**: `gcloud auth list` shows the correct account
- **Project set**: `gcloud config get-value project` returns the project ID
- **Billing linked**: `gcloud billing projects describe PROJECT_ID` shows a billing account
- **Resource deployed**: The user can access the deployed service URL

## Common Issues

| Problem | Solution |
|---------|----------|
| "Permission denied" on project creation | User may not have `resourcemanager.projects.create` permission. Check organization policies. |
| Billing not linked | Must be done via Console. CLI cannot create billing accounts. |
| API not enabled | Run `gcloud services enable SERVICE_NAME` before using a service |
| Region not available | Use `gcloud run regions list` to see available regions |

## Next Steps

After successful onboarding, suggest relevant skills:
- **cloud-run** — for deploying applications
- **bigquery** — for data analytics
- **gcloud-auth** — for understanding authentication patterns
