---
name: cloud-sql
description: Create and manage Cloud SQL instances for MySQL, PostgreSQL, and SQL Server. Covers instance creation, database management, user management, Cloud SQL Auth Proxy, backups, and high availability. Use when working with managed relational databases on Google Cloud.
---

# Cloud SQL

Fully managed relational database service for MySQL, PostgreSQL, and SQL Server on Google Cloud.

## When to Use This Skill

- Creating or managing Cloud SQL instances
- Connecting applications to Cloud SQL
- Setting up Cloud SQL Auth Proxy
- Configuring high availability and replicas
- Managing backups and restores
- Troubleshooting connection issues

## Quick Start (PostgreSQL)

### 1. Enable the API

```bash
gcloud services enable sqladmin.googleapis.com
```

### 2. Create an Instance

```bash
gcloud sql instances create INSTANCE_NAME \
    --database-version=POSTGRES_16 \
    --cpu=2 \
    --memory=7680MiB \
    --region=REGION
```

### 3. Set Default User Password

```bash
gcloud sql users set-password postgres \
    --instance=INSTANCE_NAME \
    --password=PASSWORD
```

### 4. Create a Database

```bash
gcloud sql databases create DATABASE_NAME \
    --instance=INSTANCE_NAME
```

### 5. Get Connection Name

```bash
gcloud sql instances describe INSTANCE_NAME \
    --format="value(connectionName)"
```

Output format: `PROJECT_ID:REGION:INSTANCE_NAME`

## Connecting to Cloud SQL

### Cloud SQL Auth Proxy (Recommended)

The Auth Proxy handles authentication and encryption automatically:

```bash
# Download the proxy
# https://cloud.google.com/sql/docs/postgres/connect-auth-proxy#install

# Start the proxy
./cloud-sql-proxy PROJECT_ID:REGION:INSTANCE_NAME

# Connect via psql (in another terminal)
psql "host=127.0.0.1 port=5432 user=postgres dbname=DATABASE_NAME"
```

### From Cloud Run

```bash
gcloud run deploy SERVICE_NAME \
    --image=IMAGE_URL \
    --add-cloudsql-instances=PROJECT_ID:REGION:INSTANCE_NAME \
    --set-env-vars="DB_HOST=/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME"
```

### From GKE

Use the Cloud SQL Auth Proxy as a sidecar container or use Private IP + Private Service Connect.

### Direct Connection (Private IP)

```bash
# Enable private IP on the instance
gcloud sql instances patch INSTANCE_NAME \
    --network=VPC_NETWORK_NAME \
    --no-assign-ip
```

## Database Variants

### MySQL

```bash
gcloud sql instances create INSTANCE_NAME \
    --database-version=MYSQL_8_0 \
    --cpu=2 --memory=7680MiB --region=REGION
```

### SQL Server

```bash
gcloud sql instances create INSTANCE_NAME \
    --database-version=SQLSERVER_2022_STANDARD \
    --cpu=2 --memory=7680MiB --region=REGION \
    --root-password=PASSWORD
```

## Common Operations

### List Instances

```bash
gcloud sql instances list
```

### Manage Users

```bash
# Create user
gcloud sql users create USERNAME \
    --instance=INSTANCE_NAME \
    --password=PASSWORD

# List users
gcloud sql users list --instance=INSTANCE_NAME

# Delete user
gcloud sql users delete USERNAME --instance=INSTANCE_NAME
```

### Backups

```bash
# Create on-demand backup
gcloud sql backups create --instance=INSTANCE_NAME

# List backups
gcloud sql backups list --instance=INSTANCE_NAME

# Restore from backup
gcloud sql backups restore BACKUP_ID --restore-instance=INSTANCE_NAME
```

### High Availability

```bash
# Enable HA (regional)
gcloud sql instances patch INSTANCE_NAME \
    --availability-type=REGIONAL

# Create read replica
gcloud sql instances create REPLICA_NAME \
    --master-instance-name=INSTANCE_NAME \
    --region=REGION
```

### Resize Instance

```bash
gcloud sql instances patch INSTANCE_NAME \
    --cpu=4 --memory=15360MiB
```

## IAM Roles

| Role | Description |
|------|-------------|
| `roles/cloudsql.admin` | Full control over Cloud SQL resources |
| `roles/cloudsql.editor` | Manage instances (no IAM changes) |
| `roles/cloudsql.viewer` | Read-only access |
| `roles/cloudsql.client` | Connect to instances via Auth Proxy |
| `roles/cloudsql.instanceUser` | Access Cloud SQL instances |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Can't connect via Auth Proxy | Ensure `roles/cloudsql.client` role is granted |
| Connection limit reached | Increase `max_connections` or use connection pooling (PgBouncer) |
| Slow queries | Enable query insights: `gcloud sql instances patch INSTANCE_NAME --insights-config-query-insights-enabled` |
| Instance not starting | Check disk usage: may need more storage |
| SSL/TLS errors | Use Auth Proxy instead of manual cert management |
| Maintenance window impact | Set preferred window: `gcloud sql instances patch INSTANCE_NAME --maintenance-window-day=SUN --maintenance-window-hour=2` |
