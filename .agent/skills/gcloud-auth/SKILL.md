---
name: gcloud-auth
description: Expert guidance on authenticating and authorizing to Google Cloud services. Covers human authentication (gcloud auth, ADC), service accounts, Workload Identity, API keys, IAM roles, and security best practices. Use when setting up authentication for any Google Cloud workflow.
---

# Google Cloud Authentication & Authorization

Comprehensive guide for authenticating to Google Cloud services — covering human users, service identities, Application Default Credentials (ADC), and best practices.

## When to Use This Skill

- User needs to authenticate to Google Cloud (CLI, SDK, or application)
- User is configuring service-to-service authentication
- User asks about Application Default Credentials (ADC)
- User needs to set up service accounts or Workload Identity
- User has IAM permission issues
- User asks about API keys vs service accounts

## Clarifying Questions

Before providing guidance, determine:

1. **Who is authenticating?** — Human developer, local script, or production application?
2. **Where is the code running?** — Local machine, Compute Engine, GKE, Cloud Run, or external cloud?
3. **What is the target?** — Google Cloud API (Storage, BigQuery, etc.) or a custom application?
4. **Using client libraries?** — Python, Go, Node.js libraries handle ADC automatically.

## Human Authentication

### Developer CLI Access

Authenticate the gcloud CLI itself:

```bash
gcloud auth login
```

### Application Default Credentials (ADC) for Local Development

Create local credentials that Google Cloud client libraries use automatically:

```bash
gcloud auth application-default login
```

ADC search order:
1. `GOOGLE_APPLICATION_CREDENTIALS` environment variable
2. Local gcloud JSON file (`~/.config/gcloud/application_default_credentials.json`)
3. Attached service account metadata server (on GCP infrastructure)

### Service Account Impersonation (Recommended over Key Files)

Instead of downloading service account key files, impersonate a service account:

```bash
gcloud auth application-default login --impersonate-service-account=SA_EMAIL
```

For CLI commands:

```bash
gcloud storage ls --impersonate-service-account=SA_EMAIL
```

## Service-to-Service Authentication

### Attaching Service Accounts to GCP Resources

**Cloud Run:**
```bash
gcloud run deploy SERVICE_NAME \
    --service-account=SA_EMAIL \
    --image=IMAGE_URL
```

**Compute Engine:**
```bash
gcloud compute instances create VM_NAME \
    --service-account=SA_EMAIL \
    --scopes=cloud-platform
```

**GKE (Workload Identity Federation):**
```bash
# Create KSA
kubectl create serviceaccount KSA_NAME --namespace NAMESPACE

# Allow KSA to impersonate GSA
gcloud iam service-accounts add-iam-policy-binding GSA_EMAIL \
    --role=roles/iam.workloadIdentityUser \
    --member="serviceAccount:PROJECT_ID.svc.id.goog[NAMESPACE/KSA_NAME]"

# Annotate KSA
kubectl annotate serviceaccount KSA_NAME \
    --namespace NAMESPACE \
    iam.gke.io/gcp-service-account=GSA_EMAIL
```

### External Workloads (Workload Identity Federation)

For code running outside GCP (AWS, Azure, on-prem), exchange external tokens for GCP access tokens without using key files.

## IAM Basics

### Granting Roles

```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="user:USER_EMAIL" \
    --role="ROLE_NAME"
```

### Common Predefined Roles

| Role | Description |
|------|-------------|
| `roles/viewer` | Read-only access to all resources |
| `roles/editor` | Read-write access to most resources |
| `roles/owner` | Full control including IAM management |
| `roles/storage.objectViewer` | Read Cloud Storage objects |
| `roles/bigquery.dataEditor` | Read/write BigQuery data |
| `roles/run.admin` | Full Cloud Run management |
| `roles/cloudsql.client` | Connect to Cloud SQL instances |

### Checking Permissions

```bash
# List current IAM policy
gcloud projects get-iam-policy PROJECT_ID

# Test specific permissions
gcloud projects get-iam-policy PROJECT_ID \
    --flatten="bindings[].members" \
    --filter="bindings.members:USER_EMAIL"
```

## API Keys

API keys are for public data or simplified access (e.g., Maps API, Vertex AI Express Mode). They are NOT for authenticating to most Google Cloud services.

**Best practices:**
- Restrict API keys to specific APIs
- Store in Secret Manager, not in code
- Use service accounts instead when possible

## Security Best Practices

1. **Never download service account key files** — use impersonation or attached service accounts
2. **Use least-privilege roles** — prefer predefined roles over `roles/editor` or `roles/owner`
3. **Create custom service accounts** — never use the Compute Engine default service account in production
4. **Rotate credentials regularly** — set expiration on API keys and tokens
5. **Audit with Cloud Audit Logs** — monitor who did what

## Troubleshooting

| Problem | Diagnosis | Solution |
|---------|-----------|----------|
| "Permission denied" | Missing IAM role | Grant the specific predefined role needed |
| ADC not working locally | No default credentials | Run `gcloud auth application-default login` |
| Service account can't access API | Missing role binding | `gcloud projects add-iam-policy-binding` |
| "API not enabled" | Service API disabled | `gcloud services enable API_NAME` |
| Scope restriction on Compute Engine | Legacy access scopes limiting access | Recreate VM with `--scopes=cloud-platform` |
