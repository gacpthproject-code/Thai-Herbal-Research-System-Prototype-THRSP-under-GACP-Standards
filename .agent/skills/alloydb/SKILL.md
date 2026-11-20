---
name: alloydb
description: Manage AlloyDB for PostgreSQL clusters, instances, and backups. Covers cluster creation, AlloyDB AI features (vector search, AI functions), and high-performance PostgreSQL workloads. Use when working with AlloyDB on Google Cloud.
---

# AlloyDB for PostgreSQL

Enterprise-grade, PostgreSQL-compatible managed database with disaggregated compute and storage architecture, plus built-in AI capabilities.

## When to Use This Skill

- Creating or managing AlloyDB clusters and instances
- Working with AlloyDB AI (vector search, embeddings, AI functions)
- Configuring high availability and cross-region replication
- Connecting applications to AlloyDB
- Migrating from standard PostgreSQL to AlloyDB

## Quick Start

### 1. Enable the API

```bash
gcloud services enable alloydb.googleapis.com
```

### 2. Create a Cluster

```bash
gcloud alloydb clusters create CLUSTER_NAME \
    --region=REGION \
    --password=PASSWORD \
    --network=VPC_NETWORK
```

For production, use IAM database authentication instead of passwords.

### 3. Create a Primary Instance

```bash
gcloud alloydb instances create INSTANCE_NAME \
    --cluster=CLUSTER_NAME \
    --region=REGION \
    --instance-type=PRIMARY \
    --cpu-count=2
```

### 4. Connect

Use the AlloyDB Auth Proxy or direct private IP connection:

```bash
# Install AlloyDB Auth Proxy
# https://cloud.google.com/alloydb/docs/connect-auth-proxy

# Start proxy
./alloydb-auth-proxy "projects/PROJECT_ID/locations/REGION/clusters/CLUSTER_NAME/instances/INSTANCE_NAME"

# Connect via psql
psql "host=127.0.0.1 port=5432 user=postgres dbname=postgres"
```

## AlloyDB AI Features

### Vector Search

AlloyDB integrates with `pgvector` for similarity search:

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create table with vector column
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    content TEXT,
    embedding VECTOR(768)
);

-- Create vector index
CREATE INDEX ON documents
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Similarity search
SELECT id, content, embedding <=> '[0.1, 0.2, ...]'::vector AS distance
FROM documents
ORDER BY distance
LIMIT 10;
```

### AI Functions (Generate Embeddings)

```sql
-- Generate embeddings using Vertex AI
SELECT embedding('textembedding-gecko@003', 'Your text here');
```

### Natural Language Queries

AlloyDB supports natural language to SQL translation through Gemini integration.

## Instance Types

| Type | Purpose | Use Case |
|------|---------|----------|
| PRIMARY | Read/write, serves queries | Main database instance |
| READ_POOL | Read-only replicas | Scale read workloads |
| SECONDARY | Cross-region standby | Disaster recovery |

### Create Read Pool

```bash
gcloud alloydb instances create READ_POOL_NAME \
    --cluster=CLUSTER_NAME \
    --region=REGION \
    --instance-type=READ_POOL \
    --cpu-count=2 \
    --read-pool-node-count=2
```

## Common Operations

### List Clusters and Instances

```bash
gcloud alloydb clusters list --region=REGION
gcloud alloydb instances list --cluster=CLUSTER_NAME --region=REGION
```

### Backups

```bash
# Create on-demand backup
gcloud alloydb backups create BACKUP_NAME \
    --cluster=CLUSTER_NAME \
    --region=REGION

# List backups
gcloud alloydb backups list --region=REGION

# Restore from backup
gcloud alloydb clusters restore CLUSTER_NAME \
    --backup=BACKUP_NAME \
    --region=REGION \
    --network=VPC_NETWORK
```

### Update Instance

```bash
gcloud alloydb instances update INSTANCE_NAME \
    --cluster=CLUSTER_NAME \
    --region=REGION \
    --cpu-count=4
```

### Delete Resources

```bash
# Delete instance first
gcloud alloydb instances delete INSTANCE_NAME \
    --cluster=CLUSTER_NAME --region=REGION

# Then delete cluster
gcloud alloydb clusters delete CLUSTER_NAME --region=REGION
```

## IAM Roles

| Role | Description |
|------|-------------|
| `roles/alloydb.admin` | Full control over AlloyDB resources |
| `roles/alloydb.viewer` | Read-only access |
| `roles/alloydb.client` | Connect to instances |
| `roles/alloydb.databaseUser` | Access databases |

## AlloyDB vs Cloud SQL (PostgreSQL)

| Feature | AlloyDB | Cloud SQL |
|---------|---------|-----------|
| Performance | Up to 4x faster for transactions | Standard PostgreSQL |
| Storage | Disaggregated (auto-scales) | Attached disk (manual resize) |
| AI features | Built-in (vector search, AI functions) | Limited |
| Availability | 99.99% SLA with secondary instances | 99.95% with HA |
| Cost | Higher base cost | Lower entry point |
| Best for | High-performance, AI workloads | Standard RDBMS workloads |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Can't connect | AlloyDB uses private IP only — must be in the same VPC or use Auth Proxy |
| Slow queries | Use AlloyDB Query Insights for analysis |
| Out of CPU | Scale up with `gcloud alloydb instances update --cpu-count=N` |
| Auth Proxy connection refused | Verify IAM role `roles/alloydb.client` is granted |
| Vector search slow | Create an IVFFlat or HNSW index on the embedding column |
