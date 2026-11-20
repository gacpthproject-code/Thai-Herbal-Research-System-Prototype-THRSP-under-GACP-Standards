---
name: gcloud-networking-observability
description: Investigate Google Cloud networking issues using logs, metrics, and diagnostics. Covers VPC Flow Logs, Cloud NAT, firewall logs, threat logs, Connectivity Tests, and networking metrics. Use when troubleshooting network issues on GCP.
---

# Google Cloud Networking Observability

Investigate and diagnose networking issues on Google Cloud using logs, metrics, and path diagnostics.

## When to Use This Skill

- Troubleshooting network connectivity issues on GCP
- Analyzing VPC Flow Logs for traffic patterns
- Investigating firewall denies or allows
- Diagnosing Cloud NAT issues (port exhaustion, translation errors)
- Running Connectivity Tests for path analysis
- Monitoring network performance (latency, throughput, packet loss)

## Core Directive: Results First

1. Identify the primary data source needed
2. Execute the minimum required query for a direct answer
3. Present findings immediately — do not run extra queries to "verify"

## Data Sources Overview

| Source | What It Captures | When to Use |
|--------|-----------------|-------------|
| **VPC Flow Logs** | Sample IP traffic to/from network interfaces | Traffic analysis, volume trends, top talkers |
| **Firewall Logs** | Connection attempts matched by firewall rules | Identify DENY events, verify ALLOW rules |
| **Cloud NAT Logs** | NAT translations | Audit NAT traffic, troubleshoot port exhaustion |
| **Threat Logs** | Malicious traffic patterns (Cloud Firewall Plus) | Security investigation, intrusion detection |
| **Networking Metrics** | Aggregated time-series (throughput, RTT, packet loss) | Performance monitoring, historical trends |
| **Connectivity Tests** | Static path analysis | Firewall or routing misconfigurations |

## VPC Flow Logs

### Enable Flow Logs on a Subnet

```bash
gcloud compute networks subnets update SUBNET_NAME \
    --region=REGION \
    --enable-flow-logs \
    --logging-aggregation-interval=interval-5-sec \
    --logging-flow-sampling=0.5 \
    --logging-metadata=include-all
```

### Query Flow Logs (Cloud Logging)

```bash
# Recent flow logs for a specific VM
gcloud logging read '
  resource.type="gce_subnetwork"
  AND jsonPayload.connection.src_ip="10.0.0.5"
' --limit=20 --format=json
```

### Query Flow Logs (BigQuery — Preferred for Aggregations)

```sql
-- Top 10 source IPs by bytes sent (last 24 hours)
SELECT
  jsonPayload.connection.src_ip,
  SUM(CAST(jsonPayload.bytes_sent AS INT64)) AS total_bytes
FROM `PROJECT_ID.DATASET._AllLogs`
WHERE
  timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
  AND resource.type = 'gce_subnetwork'
GROUP BY jsonPayload.connection.src_ip
ORDER BY total_bytes DESC
LIMIT 10;
```

## Firewall Logs

### Enable Firewall Logging

```bash
gcloud compute firewall-rules update RULE_NAME --enable-logging
```

### Find Blocked Traffic

```bash
gcloud logging read '
  resource.type="gce_subnetwork"
  AND jsonPayload.disposition="DENIED"
' --limit=20 --format=json
```

### BigQuery Query for Top Blocking Rules

```sql
SELECT
  jsonPayload.rule_details.reference AS rule,
  jsonPayload.disposition,
  COUNT(*) AS hit_count
FROM `PROJECT_ID.DATASET._AllLogs`
WHERE
  resource.type = 'gce_subnetwork'
  AND jsonPayload.disposition = 'DENIED'
  AND timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
GROUP BY rule, jsonPayload.disposition
ORDER BY hit_count DESC
LIMIT 10;
```

## Cloud NAT

### View NAT Logs

```bash
gcloud logging read '
  resource.type="nat_gateway"
  AND resource.labels.gateway_name="NAT_GATEWAY_NAME"
' --limit=20 --format=json
```

### Check Port Allocation

```bash
gcloud compute routers nats describe NAT_NAME \
    --router=ROUTER_NAME \
    --region=REGION
```

### Common NAT Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| Connection timeout to internet | Port exhaustion | Increase `minPortsPerVm` or add more NAT IPs |
| Intermittent connectivity | Endpoint-independent mapping off | Enable `endpointIndependentMapping` |
| High latency through NAT | NAT gateway overloaded | Distribute across multiple NAT gateways |

## Connectivity Tests

Run a static path analysis to diagnose reachability issues:

```bash
# Test VM-to-VM connectivity
gcloud network-management connectivity-tests create TEST_NAME \
    --source-instance=SOURCE_VM \
    --source-ip-address=10.0.0.5 \
    --destination-instance=DEST_VM \
    --destination-ip-address=10.0.1.5 \
    --destination-port=443 \
    --protocol=TCP

# View test results
gcloud network-management connectivity-tests describe TEST_NAME
```

### Test External Connectivity

```bash
gcloud network-management connectivity-tests create ext-test \
    --source-instance=SOURCE_VM \
    --source-ip-address=10.0.0.5 \
    --destination-ip-address=8.8.8.8 \
    --destination-port=443 \
    --protocol=TCP
```

## Networking Metrics

### Key Metrics to Monitor

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `compute.googleapis.com/instance/network/sent_bytes_count` | Bytes sent per VM | Baseline + 2 std dev |
| `compute.googleapis.com/instance/network/received_bytes_count` | Bytes received per VM | Baseline + 2 std dev |
| `loadbalancing.googleapis.com/https/total_latencies` | LB request latency | P99 > 500ms |
| `loadbalancing.googleapis.com/https/request_count` | LB request count | Sudden drop/spike |
| `router.googleapis.com/nat/port_usage` | NAT port usage | > 80% capacity |

### Query Metrics via API

```bash
curl -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://monitoring.googleapis.com/v3/projects/PROJECT_ID/timeSeries?filter=metric.type%3D%22compute.googleapis.com%2Finstance%2Fnetwork%2Fsent_bytes_count%22&interval.startTime=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)&interval.endTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

## Troubleshooting Flowchart

1. **Can't reach a resource?** → Run a Connectivity Test first
2. **Connectivity Test shows firewall block?** → Check Firewall Logs for the DENY rule
3. **Traffic reaching VM but app not responding?** → Check VPC Flow Logs + application logs
4. **Intermittent external connectivity?** → Check Cloud NAT logs for port exhaustion
5. **High latency?** → Check networking metrics for the load balancer or VM network interface
