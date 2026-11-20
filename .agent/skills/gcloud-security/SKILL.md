---
name: gcloud-security
description: Security guidance for Google Cloud workloads based on the Well-Architected Framework. Covers IAM, network security, data protection, operational security, zero trust, shift-left security, and compliance. Use when evaluating or hardening the security posture of GCP workloads.
---

# Google Cloud Security (Well-Architected Framework)

Structured approach to building robust security postures on Google Cloud, based on the Well-Architected Framework Security pillar.

## When to Use This Skill

- Evaluating the security posture of a Google Cloud workload
- Hardening IAM, networking, or data protection
- Implementing zero trust architecture on GCP
- Preparing for security audits or compliance reviews
- Designing security controls for new GCP projects

## Core Security Principles

### 1. Security by Design
Integrate security from the initial architecture phase, not as an afterthought.

### 2. Zero Trust
Never trust, always verify. Continuously verify resource access regardless of network location.

### 3. Shift-Left Security
Implement security controls early in the development lifecycle — in CI/CD, not just production.

### 4. Preemptive Cyber Defense
Adopt proactive threat intelligence and layered controls rather than reactive incident response.

### 5. Least Privilege
Grant only the minimum permissions required for each identity and resource.

## Security Checklist by Domain

### Identity & Access Management (IAM)

- [ ] Use predefined roles instead of `roles/editor` or `roles/owner`
- [ ] Create custom service accounts (never use default compute SA in production)
- [ ] Enable Workload Identity Federation for GKE and external workloads
- [ ] Disable service account key creation via org policy
- [ ] Enable IAM audit logging
- [ ] Review IAM bindings quarterly

```bash
# Audit IAM policy
gcloud projects get-iam-policy PROJECT_ID --format=json

# List service account keys (should be empty ideally)
gcloud iam service-accounts keys list \
    --iam-account=SA_EMAIL \
    --managed-by=user
```

### Network Security

- [ ] Use Private Google Access for internal-only API traffic
- [ ] Enable VPC Service Controls for sensitive data projects
- [ ] Configure firewall rules with least-privilege source/target
- [ ] Use Cloud Armor for DDoS protection and WAF
- [ ] Enable VPC Flow Logs for network visibility

```bash
# List firewall rules
gcloud compute firewall-rules list --format="table(name,network,direction,allowed,sourceRanges)"

# Enable VPC Flow Logs on a subnet
gcloud compute networks subnets update SUBNET_NAME \
    --region=REGION \
    --enable-flow-logs
```

### Data Protection

- [ ] Enable CMEK (Customer-Managed Encryption Keys) for sensitive data
- [ ] Use Cloud KMS for key management
- [ ] Enable Sensitive Data Protection (DLP) scanning
- [ ] Configure Cloud Storage bucket-level access (uniform)
- [ ] Disable public access to storage buckets

```bash
# Check bucket public access
gcloud storage buckets describe gs://BUCKET_NAME --format="json(iamConfiguration)"

# Enable uniform bucket-level access
gcloud storage buckets update gs://BUCKET_NAME --uniform-bucket-level-access
```

### Security Operations

- [ ] Enable Security Command Center (SCC) for vulnerability scanning
- [ ] Configure Cloud Audit Logs (Admin Activity + Data Access)
- [ ] Set up alerting for suspicious IAM changes
- [ ] Enable Container Threat Detection for GKE
- [ ] Implement Binary Authorization for container supply chain

```bash
# View recent audit logs
gcloud logging read "logName:activity" --limit=20

# List SCC findings
gcloud scc findings list ORGANIZATION_ID --source="-"
```

### Supply Chain Security

- [ ] Use Artifact Registry (not Docker Hub) for container images
- [ ] Enable Artifact Analysis for vulnerability scanning
- [ ] Implement Binary Authorization for deployment policies
- [ ] Use Cloud Build with verified builders
- [ ] Sign container images with cosign/sigstore

## Assessment Questions

When evaluating a workload's security, ask:

1. How are identities managed? (Cloud Identity, federation, Workforce Identity?)
2. Are service accounts following least privilege? Any downloaded keys?
3. Is network traffic flowing through private paths or public internet?
4. Are VPC Service Controls in place for sensitive projects?
5. Is encryption at rest using Google-managed or customer-managed keys?
6. Are security findings from SCC being triaged and remediated?
7. Is there a CI/CD pipeline with security scanning (SAST, container scanning)?
8. Are Cloud Audit Logs being exported and monitored?

## Quick Wins for Hardening

| Action | Impact | Effort |
|--------|--------|--------|
| Enable org policy to block SA key creation | High | Low |
| Enable VPC Service Controls | High | Medium |
| Switch to Workload Identity | High | Medium |
| Enable SCC Standard tier | High | Low |
| Set uniform bucket-level access | Medium | Low |
| Enable Cloud Audit Logs export to BigQuery | Medium | Low |
