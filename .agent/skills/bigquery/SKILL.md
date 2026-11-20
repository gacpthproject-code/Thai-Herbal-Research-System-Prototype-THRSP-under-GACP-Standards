---
name: bigquery
description: Manage datasets, tables, and jobs in BigQuery. Use when running SQL queries, ingesting data, managing BigQuery resources, or leveraging BigQuery ML for data analytics and AI-driven insights.
---

# BigQuery

Serverless, AI-ready data platform for high-speed analysis of large datasets using SQL and Python.

## When to Use This Skill

- Creating or managing BigQuery datasets and tables
- Running SQL queries against BigQuery
- Loading data into BigQuery (CSV, JSON, Parquet, Avro)
- Using BigQuery ML for machine learning
- Setting up scheduled queries or data transfers
- Optimizing query performance and costs

## Quick Start

### 1. Enable the API

```bash
gcloud services enable bigquery.googleapis.com
```

### 2. Create a Dataset

```bash
bq mk --dataset --location=US PROJECT_ID:my_dataset
```

### 3. Create a Table with Schema

Create `schema.json`:
```json
[
  {"name": "id", "type": "INTEGER", "mode": "REQUIRED"},
  {"name": "name", "type": "STRING", "mode": "REQUIRED"},
  {"name": "email", "type": "STRING", "mode": "NULLABLE"},
  {"name": "created_at", "type": "TIMESTAMP", "mode": "REQUIRED"}
]
```

```bash
bq mk --table my_dataset.my_table schema.json
```

### 4. Run a Query

```bash
bq query --use_legacy_sql=false \
    'SELECT name, COUNT(*) as count
     FROM `my_dataset.my_table`
     GROUP BY name
     ORDER BY count DESC
     LIMIT 10'
```

## Data Loading

### From Local File

```bash
# CSV
bq load --source_format=CSV --autodetect \
    my_dataset.my_table ./data.csv

# JSON (newline-delimited)
bq load --source_format=NEWLINE_DELIMITED_JSON --autodetect \
    my_dataset.my_table ./data.jsonl

# Parquet
bq load --source_format=PARQUET \
    my_dataset.my_table ./data.parquet
```

### From Cloud Storage

```bash
bq load --source_format=CSV --autodetect \
    my_dataset.my_table gs://bucket/path/data.csv
```

### Streaming Insert (Real-time)

Use client libraries for streaming inserts. Example with Python:

```python
from google.cloud import bigquery

client = bigquery.Client()
table_id = "project.dataset.table"

rows = [
    {"name": "Alice", "age": 30},
    {"name": "Bob", "age": 25},
]

errors = client.insert_rows_json(table_id, rows)
if errors:
    print(f"Errors: {errors}")
```

## Common Operations

### List Datasets and Tables

```bash
bq ls
bq ls my_dataset
```

### Show Table Schema

```bash
bq show --schema --format=json my_dataset.my_table
```

### Export Data

```bash
bq extract --destination_format=CSV \
    my_dataset.my_table gs://bucket/export/data.csv
```

### Delete Resources

```bash
bq rm -t my_dataset.my_table    # Delete table
bq rm -r -d my_dataset          # Delete dataset and all tables
```

### Scheduled Queries

```bash
bq mk --transfer_config \
    --data_source=scheduled_query \
    --target_dataset=my_dataset \
    --display_name="Daily aggregation" \
    --schedule="every 24 hours" \
    --params='{"query":"SELECT * FROM `source.table`","write_disposition":"WRITE_TRUNCATE","destination_table_name_template":"daily_agg"}'
```

## BigQuery ML (Quick Reference)

### Create a Model

```sql
CREATE OR REPLACE MODEL `my_dataset.my_model`
OPTIONS(
  model_type='LOGISTIC_REG',
  input_label_cols=['label']
) AS
SELECT * FROM `my_dataset.training_data`;
```

### Evaluate a Model

```sql
SELECT * FROM ML.EVALUATE(MODEL `my_dataset.my_model`);
```

### Make Predictions

```sql
SELECT * FROM ML.PREDICT(
  MODEL `my_dataset.my_model`,
  (SELECT * FROM `my_dataset.new_data`)
);
```

## Cost Optimization

| Strategy | How |
|----------|-----|
| Use partitioned tables | `--time_partitioning_field=date_column` |
| Use clustered tables | `--clustering_fields=col1,col2` |
| Preview before querying | `bq query --dry_run` to estimate bytes scanned |
| Limit columns | Select only needed columns, avoid `SELECT *` |
| Use materialized views | Pre-compute frequent aggregations |
| Set custom quotas | Limit per-user/per-project query bytes |

## IAM Roles

| Role | Description |
|------|-------------|
| `roles/bigquery.admin` | Full control over all BigQuery resources |
| `roles/bigquery.dataEditor` | Read/write data in datasets |
| `roles/bigquery.dataViewer` | Read-only access to data |
| `roles/bigquery.jobUser` | Run queries and jobs |
| `roles/bigquery.user` | Run queries, create datasets |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Access Denied" | Grant `roles/bigquery.dataViewer` or `roles/bigquery.jobUser` |
| Query too expensive | Use `--dry_run` first, add partitioning/clustering |
| Streaming insert errors | Check row size limits (max 10MB per request) |
| Schema mismatch on load | Use `--autodetect` or provide explicit schema file |
| Slot contention | Consider flat-rate reservations for heavy workloads |
