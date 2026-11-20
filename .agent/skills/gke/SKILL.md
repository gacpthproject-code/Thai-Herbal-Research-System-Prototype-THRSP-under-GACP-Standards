---
name: gke
description: Plan, create, and manage Google Kubernetes Engine (GKE) clusters. Covers Autopilot vs Standard, networking, security (Workload Identity, RBAC), scaling, cost optimization, observability, and AI/ML inference workloads. Use when working with Kubernetes on Google Cloud.
---

# Google Kubernetes Engine (GKE)

Managed Kubernetes platform on Google Cloud for deploying, scaling, and operating containerized applications. Defaults to Autopilot mode for production workloads.

## When to Use This Skill

- Creating or configuring GKE clusters
- Deploying applications to Kubernetes on GCP
- Setting up GKE networking (private clusters, ingress, Gateway API)
- Configuring Workload Identity for secure GCP access
- Scaling and autoscaling workloads
- Running AI/ML inference on GKE (GPU/TPU)
- Cost optimization for GKE

## Quick Start

```bash
# Enable the API
gcloud services enable container.googleapis.com

# Create an Autopilot cluster
gcloud container clusters create-auto my-cluster --region=us-central1

# Get credentials
gcloud container clusters get-credentials my-cluster --region=us-central1

# Deploy a sample app
kubectl create deployment hello-server \
    --image=us-docker.pkg.dev/google-samples/containers/gke/hello-app:1.0

# Expose the deployment
kubectl expose deployment hello-server --type=LoadBalancer --port=80 --target-port=8080
```

## Autopilot vs Standard

| Feature | Autopilot (Recommended) | Standard |
|---------|------------------------|----------|
| Node management | Google-managed | User-managed |
| Scaling | Per-pod billing, auto node provisioning | Manual node pools + HPA/VPA |
| Security | Pre-hardened, Workload Identity default | Manual hardening required |
| GPU/TPU | Supported via compute classes | Supported via node pools |
| Best for | Most workloads | Custom kernel/node configs |

## Cluster Creation

### Autopilot (Production Default)

```bash
gcloud container clusters create-auto CLUSTER_NAME \
    --region=REGION \
    --release-channel=regular \
    --enable-private-nodes \
    --master-ipv4-cidr=172.16.0.0/28
```

### Standard

```bash
gcloud container clusters create CLUSTER_NAME \
    --region=REGION \
    --num-nodes=3 \
    --enable-autoscaling --min-nodes=1 --max-nodes=10 \
    --workload-pool=PROJECT_ID.svc.id.goog \
    --enable-private-nodes \
    --master-ipv4-cidr=172.16.0.0/28
```

## Workload Identity (Service-to-GCP Auth)

The recommended way to authenticate GKE workloads to Google Cloud APIs:

```bash
# Create Google Service Account
gcloud iam service-accounts create GSA_NAME

# Grant the GSA the needed role
gcloud projects add-iam-policy-binding PROJECT_ID \
    --member="serviceAccount:GSA_NAME@PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/storage.objectViewer"

# Create Kubernetes Service Account
kubectl create serviceaccount KSA_NAME -n NAMESPACE

# Bind KSA to GSA
gcloud iam service-accounts add-iam-policy-binding \
    GSA_NAME@PROJECT_ID.iam.gserviceaccount.com \
    --role=roles/iam.workloadIdentityUser \
    --member="serviceAccount:PROJECT_ID.svc.id.goog[NAMESPACE/KSA_NAME]"

# Annotate KSA
kubectl annotate serviceaccount KSA_NAME \
    -n NAMESPACE \
    iam.gke.io/gcp-service-account=GSA_NAME@PROJECT_ID.iam.gserviceaccount.com
```

## Scaling

### Horizontal Pod Autoscaler (HPA)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### Vertical Pod Autoscaler (VPA)

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: my-app-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  updatePolicy:
    updateMode: Auto
```

## Networking

### Ingress with Google Cloud Load Balancer

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-ingress
  annotations:
    kubernetes.io/ingress.global-static-ip-name: my-static-ip
    networking.gke.io/managed-certificates: my-cert
spec:
  defaultBackend:
    service:
      name: my-service
      port:
        number: 80
```

### Gateway API (Recommended over Ingress)

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: my-gateway
spec:
  gatewayClassName: gke-l7-global-external-managed
  listeners:
  - name: https
    protocol: HTTPS
    port: 443
```

## Cost Optimization

| Strategy | Implementation |
|----------|---------------|
| Use Autopilot | Pay per pod resource requests, not idle nodes |
| Spot VMs | Add `--spot` to node pool for fault-tolerant workloads |
| Right-size pods | Use VPA recommendations to set accurate resource requests |
| Committed Use Discounts | Purchase CUDs for predictable base load |
| Namespace quotas | Set `ResourceQuota` per namespace to prevent waste |

## Observability

```bash
# View cluster logs
gcloud logging read "resource.type=k8s_container AND resource.labels.cluster_name=CLUSTER_NAME" --limit=50

# Check node status
kubectl get nodes -o wide

# Check pod status
kubectl get pods -A

# Describe problematic pod
kubectl describe pod POD_NAME -n NAMESPACE

# View pod logs
kubectl logs POD_NAME -n NAMESPACE --tail=100
```

## Common Operations

```bash
# Resize node pool (Standard only)
gcloud container clusters resize CLUSTER_NAME \
    --node-pool=POOL_NAME --num-nodes=5

# Upgrade cluster
gcloud container clusters upgrade CLUSTER_NAME --region=REGION

# Delete cluster
gcloud container clusters delete CLUSTER_NAME --region=REGION
```

## Troubleshooting

| Problem | Diagnosis | Solution |
|---------|-----------|----------|
| Pod stuck in Pending | `kubectl describe pod` — check events | Insufficient resources; scale up or adjust requests |
| ImagePullBackOff | Wrong image URL or no permissions | Verify image URL, check Artifact Registry IAM |
| CrashLoopBackOff | App crashing on start | Check logs: `kubectl logs POD_NAME --previous` |
| Node NotReady | Node health issue | `kubectl describe node NODE_NAME` for conditions |
| Permission denied to GCP API | Workload Identity not configured | Follow Workload Identity setup above |
