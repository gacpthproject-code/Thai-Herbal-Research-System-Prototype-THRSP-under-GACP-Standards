---
name: gemini-api
description: Build applications with the Gemini API on Google Cloud using the Gen AI SDK. Covers text generation, multimodal understanding, function calling, structured output, embeddings, Live API, and batch prediction. Use when integrating Gemini models into applications via Vertex AI / Agent Platform.
---

# Gemini API (Google Cloud)

Access Google's Gemini models for enterprise AI applications through the Gen AI SDK on Vertex AI (Agent Platform).

## When to Use This Skill

- Building applications that use Gemini models
- Integrating text generation, multimodal, or function calling capabilities
- Setting up authentication for Vertex AI / Agent Platform
- Choosing the right Gemini model for a use case
- Working with embeddings, caching, or batch prediction

## IMPORTANT: Use the Unified Gen AI SDK

**ALWAYS** use the new Gen AI SDK. Legacy SDKs are deprecated:

| Language | Package | Install |
|----------|---------|---------|
| Python | `google-genai` | `pip install google-genai` |
| JavaScript/TypeScript | `@google/genai` | `npm install @google/genai` |
| Go | `google.golang.org/genai` | `go get google.golang.org/genai` |
| Java | `com.google.genai:google-genai` | Maven/Gradle |
| C#/.NET | `Google.GenAI` | `dotnet add package Google.GenAI` |

**DO NOT use** `google-cloud-aiplatform`, `@google-cloud/vertexai`, or `google-generativeai` — these are legacy.

## Authentication

### Application Default Credentials (Recommended)

```bash
export GOOGLE_CLOUD_PROJECT='your-project-id'
export GOOGLE_CLOUD_LOCATION='global'
export GOOGLE_GENAI_USE_VERTEXAI=true
```

Then initialize without arguments:

```python
from google import genai
client = genai.Client()
```

### With API Key (Express Mode)

```bash
export GOOGLE_API_KEY='your-api-key'
export GOOGLE_GENAI_USE_VERTEXAI=true
```

### Explicit Configuration

```python
from google import genai
client = genai.Client(vertexai=True, project="your-project-id", location="global")
```

## Models

### Current Models

| Model | Best For | Context Window |
|-------|----------|---------------|
| `gemini-2.5-pro` | Complex reasoning, coding, research | 1M tokens |
| `gemini-2.5-flash` | Fast, balanced performance, multimodal | 1M tokens |
| `gemini-2.5-flash-lite` | High-frequency, lightweight tasks | 1M tokens |

Use `location="global"` by default for automatic region routing.

## Quick Start Examples

### Python — Text Generation

```python
from google import genai

client = genai.Client()
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Explain quantum computing in simple terms"
)
print(response.text)
```

### Python — Chat Conversation

```python
from google import genai

client = genai.Client()
chat = client.chats.create(model="gemini-2.5-flash")

response = chat.send_message("What is machine learning?")
print(response.text)

response = chat.send_message("How does it differ from deep learning?")
print(response.text)
```

### Python — Multimodal (Image + Text)

```python
from google import genai
from google.genai import types

client = genai.Client()

image = types.Part.from_uri(
    file_uri="gs://bucket/image.jpg",
    mime_type="image/jpeg"
)

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=[image, "Describe what you see in this image"]
)
print(response.text)
```

### JavaScript/TypeScript

```typescript
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  vertexai: { project: "your-project-id", location: "global" }
});

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: "Explain quantum computing"
});
console.log(response.text);
```

### Go

```go
package main

import (
    "context"
    "fmt"
    "log"
    "google.golang.org/genai"
)

func main() {
    ctx := context.Background()
    client, err := genai.NewClient(ctx, &genai.ClientConfig{
        Backend:  genai.BackendVertexAI,
        Project:  "your-project-id",
        Location: "global",
    })
    if err != nil {
        log.Fatal(err)
    }

    resp, err := client.Models.GenerateContent(
        ctx, "gemini-2.5-flash",
        genai.Text("Explain quantum computing"), nil,
    )
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(resp.Text)
}
```

## Key Capabilities

### Function Calling

```python
from google import genai
from google.genai import types

def get_weather(city: str) -> dict:
    return {"city": city, "temp": 22, "condition": "sunny"}

tool = types.Tool(function_declarations=[
    types.FunctionDeclaration(
        name="get_weather",
        description="Get current weather for a city",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "city": types.Schema(type="STRING", description="City name")
            },
            required=["city"]
        )
    )
])

client = genai.Client()
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="What's the weather in Tokyo?",
    config=types.GenerateContentConfig(tools=[tool])
)
```

### Structured Output (JSON)

```python
from google import genai
from google.genai import types

schema = types.Schema(
    type="OBJECT",
    properties={
        "name": types.Schema(type="STRING"),
        "age": types.Schema(type="INTEGER"),
        "skills": types.Schema(type="ARRAY", items=types.Schema(type="STRING"))
    },
    required=["name", "age"]
)

client = genai.Client()
response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Create a profile for a senior Python developer",
    config=types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=schema
    )
)
```

### Embeddings

```python
from google import genai

client = genai.Client()
response = client.models.embed_content(
    model="text-embedding-005",
    contents=["What is machine learning?", "Explain AI"]
)
for embedding in response.embeddings:
    print(f"Dimension: {len(embedding.values)}")
```

### Context Caching

Cache large contexts to save cost and latency:

```python
from google import genai
from google.genai import types

client = genai.Client()

cache = client.caches.create(
    model="gemini-2.5-flash",
    config=types.CreateCachedContentConfig(
        contents=[types.Content(parts=[types.Part(text="<large document>")])],
        ttl="3600s"
    )
)

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Summarize the document",
    config=types.GenerateContentConfig(cached_content=cache.name)
)
```

### Streaming

```python
from google import genai

client = genai.Client()

for chunk in client.models.generate_content_stream(
    model="gemini-2.5-flash",
    contents="Write a short story about AI"
):
    print(chunk.text, end="")
```

## Safety Settings

```python
from google.genai import types

config = types.GenerateContentConfig(
    safety_settings=[
        types.SafetySetting(
            category="HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold="BLOCK_ONLY_HIGH"
        )
    ]
)
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Permission denied" | Ensure `roles/aiplatform.user` role is granted |
| "Model not found" | Check model name and region availability |
| "Quota exceeded" | Request quota increase or use a different region |
| ImportError for `google-genai` | Ensure you installed `google-genai`, not `google-generativeai` |
| Slow responses | Use `location="global"` for automatic routing |
