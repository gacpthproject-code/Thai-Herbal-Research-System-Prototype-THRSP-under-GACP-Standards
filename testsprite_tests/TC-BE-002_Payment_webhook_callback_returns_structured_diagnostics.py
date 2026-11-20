import requests

def test_payment_webhook_callback_returns_structured_diagnostics():
    base_url = "http://localhost/api"
    url = f"{base_url}/webhooks/payment"
    headers = {
        "Content-Type": "application/json"
    }
    payload = {
        "event": "payment_intent.succeeded",
        "data": {
            "object": {
                "id": "pi_123456789",
                "amount": 1000,
                "currency": "usd"
            }
        }
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 200, f"Expected status code 200 but got {response.status_code}"

    try:
        resp_json = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    # Validate required fields in response
    assert "requestId" in resp_json, "Missing 'requestId' in response"
    assert "callbackStatus" in resp_json, "Missing 'callbackStatus' in response"
    assert resp_json["callbackStatus"] in ("success", "failed"), f"Invalid callbackStatus value: {resp_json.get('callbackStatus')}"
    assert "processing" in resp_json, "Missing 'processing' in response"
    assert isinstance(resp_json["processing"], bool), "'processing' should be a boolean"

    # If callbackStatus is 'failed', error object must be present with code and message
    if resp_json["callbackStatus"] == "failed":
        assert "error" in resp_json, "Missing 'error' object when callbackStatus is 'failed'"
        error = resp_json["error"]
        assert isinstance(error, dict), "'error' should be an object"
        assert "code" in error, "Missing 'code' in error object"
        assert isinstance(error["code"], (str, int)), "'code' should be a string or integer"
        assert "message" in error, "Missing 'message' in error object"
        assert isinstance(error["message"], str), "'message' should be a string"

test_payment_webhook_callback_returns_structured_diagnostics()