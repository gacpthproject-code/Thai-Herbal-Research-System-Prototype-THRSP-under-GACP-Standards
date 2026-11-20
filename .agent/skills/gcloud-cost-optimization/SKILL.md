---
name: gcloud-cost-optimization
description: Cost optimization guidance for Google Cloud workloads based on the Well-Architected Framework. Covers billing analysis, rightsizing, committed use discounts, Spot VMs, storage lifecycle policies, and FinOps practices. Use when optimizing GCP spending or evaluating cost efficiency.
---

# Google Cloud Cost Optimization (Well-Architected Framework)

Optimize cloud spending while maximizing business value, using FinOps practices and GCP-native tools.

## When to Use This Skill

- Analyzing and reducing Google Cloud costs
- Right-sizing compute instances
- Evaluating committed use discounts vs on-demand
- Setting up billing alerts and budgets
- Implementing storage lifecycle policies
- Building a FinOps practice

## Core Cost Principles

### 1. Align Spending with Business Value
Every cloud resource should deliver measurable business value.

### 2. Foster Cost Awareness
Teams should understand the cost impact of their architecture decisions.

### 3. Optimize Resource Usage
Provision only what you need, pay only for what you consume.

### 4. Optimize Continuously
Monitor costs continuously and make proactive adjustments.

## Cost Visibility

### Export Billing to BigQuery

```bash
# Enable billing export (must be done in Console or via API)
# Navigate to: Billing > Billing export > BigQuery export

# Once exported, query costs by service
bq query --use_legacy_sql=false '
SELECT
  service.description AS service,
  SUM(cost) AS total_cost,
  SUM(usage.amount) AS usage_amount,
  usage.unit
FROM `PROJECT_ID.billing_dataset.gcp_billing_export_v1_BILLING_ACCOUNT_ID`
WHERE DATE(usage_start_time) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY service, usage.unit
ORDER BY total_cost DESC
LIMIT 20'
```

### Set Up Budget Alerts

```bash
# Create a budget (via gcloud)
gcloud billing budgets create \
    --billing-account=BILLING_ACCOUNT_ID \
    --display-name="Monthly Budget" \
    --budget-amount=1000USD \
    --threshold-rule=percent=0.5 \
    --threshold-rule=percent=0.9 \
    --threshold-rule=percent=1.0
```

### Label Resources for Cost Attribution

```bash
# Label a Compute Engine instance
gcloud compute instances update INSTANCE_NAME \
    --update-labels=team=backend,environment=production

# Label a GKE cluster
gcloud container clusters update CLUSTER_NAME \
    --update-labels=team=platform

# Query costs by label in BigQuery
bq query --use_legacy_sql=false '
SELECT
  labels.value AS team,
  SUM(cost) AS total_cost
FROM `billing_dataset.gcp_billing_export_v1_*`,
  UNNEST(labels) AS labels
WHERE labels.key = "team"
GROUP BY team
ORDER BY total_cost DESC'
```

## Compute Cost Optimization

### Rightsizing with Recommender

```bash
# Get VM rightsizing recommendations
gcloud recommender recommendations list \
    --project=PROJECT_ID \
    --location=ZONE \
    --recommender=google.compute.instance.MachineTypeRecommender \
    --format="table(name,description,primaryImpact.costProjection.cost)"
```

### Spot VMs (Up to 91% Discount)

For fault-tolerant workloads:

```bash
# Create Spot VM
gcloud compute instances create INSTANCE_NAME \
    --provisioning-model=SPOT \
    --instance-termination-action=STOP

# GKE with Spot node pool
gcloud container node-pools create spot-pool \
    --cluster=CLUSTER_NAME \
    --spot \
    --num-nodes=3
```

### Committed Use Discounts (CUDs)

| Type | Discount | Term |
|------|----------|------|
| Spend-based CUD | Up to 25% (1yr) / 52% (3yr) | 1 or 3 years |
| Resource-based CUD | Up to 57% (1yr) / 70% (3yr) | 1 or 3 years |

```bash
# List active commitments
gcloud compute commitments list --region=REGION
```

### Auto-Scaling

```bash
# Set min/max for MIG
gcloud compute instance-groups managed set-autoscaling MIG_NAME \
    --min-num-replicas=1 \
    --max-num-replicas=10 \
    --target-cpu-utilization=0.7

# Cloud Run min/max instances
gcloud run services update SERVICE_NAME \
    --min-instances=0 --max-instances=10
```

## Storage Cost Optimization

### Lifecycle Policies

```bash
# Create lifecycle rule to move to Nearline after 30 days, Coldline after 90
cat > lifecycle.json << 'EOF'
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "SetStorageClass", "storageClass": "NEARLINE"},
        "condition": {"age": 30, "matchesStorageClass": ["STANDARD"]}
      },
      {
        "action": {"type": "SetStorageClass", "storageClass": "COLDLINE"},
        "condition": {"age": 90, "matchesStorageClass": ["NEARLINE"]}
      },
      {
        "action": {"type": "Delete"},
        "condition": {"age": 365}
      }
    ]
  }
}
EOF

gcloud storage buckets update gs://BUCKET_NAME --lifecycle-file=lifecycle.json
```

### Storage Classes

| Class | Use Case | Min Storage Duration |
|-------|----------|---------------------|
| Standard | Frequently accessed | None |
| Nearline | ~1x/month access | 30 days |
| Coldline | ~1x/quarter access | 90 days |
| Archive | ~1x/year access | 365 days |

## Database Cost Optimization

- Use **shared-core** instances for dev/test: `--tier=db-f1-micro`
- Stop unused dev instances: `gcloud sql instances patch INSTANCE_NAME --activation-policy=NEVER`
- Right-size based on CPU/memory utilization
- Use read replicas instead of scaling up the primary

## Cost Optimization Checklist

- [ ] **Cost Attribution**: 100% of resources have team/environment labels
- [ ] **Granular Visibility**: Billing exported to BigQuery
- [ ] **Budgets & Alerts**: Per-project budgets with threshold notifications
- [ ] **Rightsizing**: Monthly review of Recommender suggestions
- [ ] **Commitment Strategy**: CUDs evaluated monthly for stable workloads
- [ ] **Idle Resources**: Monthly cleanup of unused VMs, disks, IPs, load balancers
- [ ] **Managed Services**: Prefer serverless (Cloud Run, Cloud Functions) over VMs
- [ ] **Storage Tiers**: Active lifecycle policies on all storage buckets
