---
name: gcloud-reliability
description: Reliability guidance for Google Cloud workloads based on the Well-Architected Framework. Covers SLOs, redundancy, horizontal scaling, graceful degradation, failure recovery, observability, and disaster recovery. Use when designing or evaluating workload reliability on GCP.
---

# Google Cloud Reliability (Well-Architected Framework)

Design, deploy, and manage dependable, fault-tolerant workloads on Google Cloud.

## When to Use This Skill

- Designing high-availability architectures on GCP
- Setting SLOs and error budgets
- Implementing disaster recovery (DR) strategies
- Configuring auto-scaling and redundancy
- Troubleshooting availability issues
- Preparing for reliability reviews

## Core Reliability Principles

### 1. User-Experience SLOs
Measure reliability based on actual user experience, not just infrastructure metrics.

### 2. Realistic Reliability Targets
Balance cost against reliability needs using error budgets. 99.99% costs significantly more than 99.9%.

### 3. Resource Redundancy
Eliminate single points of failure by duplicating critical components across zones and regions.

### 4. Horizontal Scalability
Scale by adding instances rather than scaling up individual machines.

### 5. Observability for Failure Detection
Implement monitoring, logging, and alerting to proactively detect anomalies.

### 6. Graceful Degradation
Maintain critical functionality at reduced capacity during partial failures.

### 7. Failure Recovery Testing
Continuously simulate failures to verify recovery procedures work.

### 8. Data Loss Recovery Testing
Regularly test backup/restore within RTO/RPO targets.

### 9. Blameless Postmortems
Investigate outages comprehensively to understand root causes and prevent recurrence.

## Availability Targets

| Target | Monthly Downtime | Typical Use Case |
|--------|------------------|------------------|
| 99% | ~7.3 hours | Internal tools |
| 99.9% | ~43.8 minutes | Business applications |
| 99.95% | ~21.9 minutes | Customer-facing apps |
| 99.99% | ~4.4 minutes | Critical infrastructure |

## Architecture Patterns by Availability Level

### Single-Zone (99% - 99.9%)
- Single Compute Engine instance or Cloud Run service
- Cloud SQL without HA
- Suitable for dev/staging

### Multi-Zone (99.9% - 99.99%)
- Regional GKE cluster or Cloud Run (auto multi-zone)
- Cloud SQL with `REGIONAL` availability
- Cloud Load Balancing across zones

```bash
# Cloud SQL with HA
gcloud sql instances patch INSTANCE_NAME --availability-type=REGIONAL

# GKE regional cluster (multi-zone by default)
gcloud container clusters create-auto my-cluster --region=us-central1
```

### Multi-Region (99.99%+)
- Spanner for globally distributed data
- Cloud Storage multi-region buckets
- Global Load Balancer with backends in multiple regions

```bash
# Multi-region Cloud Storage bucket
gcloud storage buckets create gs://BUCKET_NAME --location=US

# Global Load Balancer spans multiple regions automatically
```

## Key GCP Products for Reliability

| Component | Product | Reliability Feature |
|-----------|---------|-------------------|
| Compute | Cloud Run | Auto-scales, multi-zone by default |
| Compute | GKE Autopilot | Auto node repair, multi-zone |
| Compute | Compute Engine MIG | Auto-healing, auto-scaling |
| Database | Cloud SQL HA | Automatic failover to standby |
| Database | Spanner | Global consistency, 99.999% SLA |
| Load Balancing | Cloud Load Balancing | Global, health-checked backends |
| Storage | Cloud Storage | 99.999999999% durability |
| Monitoring | Cloud Monitoring | SLO monitoring, alerting |
| DR | Backup and DR Service | Automated backup/restore |

## SLO Implementation

### Define an SLO with Cloud Monitoring

```bash
# Create an SLO for a Cloud Run service (99.9% availability)
gcloud monitoring slos create \
    --service=SERVICE_ID \
    --display-name="Availability SLO" \
    --goal=0.999 \
    --rolling-period=30d \
    --request-based-sli='{"goodTotalRatio":{"totalServiceFilter":"metric.type=\"run.googleapis.com/request_count\"","goodServiceFilter":"metric.type=\"run.googleapis.com/request_count\" AND resource.label.response_code_class=\"2xx\""}}'
```

### Error Budget Alerting

Set alerts when error budget is consumed:
- 50% consumed → Warning (investigate trends)
- 75% consumed → Critical (freeze non-essential changes)
- 100% consumed → Freeze all deployments

## Health Checks & Auto-Healing

### Compute Engine Managed Instance Group

```bash
# Create health check
gcloud compute health-checks create http my-health-check \
    --port=8080 --request-path=/health

# Create MIG with auto-healing
gcloud compute instance-groups managed create my-mig \
    --template=my-template \
    --size=3 \
    --zone=us-central1-a \
    --health-check=my-health-check \
    --initial-delay=300
```

### Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 15
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
```

## Reliability Assessment Checklist

- [ ] SLOs defined and monitored for all user-facing services
- [ ] Error budgets tracked with automated alerting
- [ ] No single points of failure in the architecture
- [ ] Auto-scaling configured for variable workloads
- [ ] Health checks and auto-healing enabled
- [ ] Backups tested with restore drills (quarterly minimum)
- [ ] Disaster recovery plan documented and tested
- [ ] Postmortem process established for incidents
- [ ] Graceful degradation implemented for non-critical features
- [ ] Chaos testing or game days scheduled regularly
