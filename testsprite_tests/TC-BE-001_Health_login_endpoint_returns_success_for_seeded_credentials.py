import requests

def test_TC_BE_001_health_login_seeded_credentials():
    base_url = "http://localhost/api"
    url = f"{base_url}/auth/health/login"
    payload = {
        "healthId": "1100100100011",
        "password": "Test@12345"
    }
    headers = {
        "Content-Type": "application/json"
    }
    timeout = 30

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=timeout)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 200, f"Expected HTTP 200 but got {response.status_code}"

    try:
        resp_json = response.json()
    except ValueError:
        assert False, "Response content is not valid JSON"

    # Validate success true
    assert "success" in resp_json, "Missing 'success' field in response"
    assert resp_json["success"] is True, f"Expected success=True but got {resp_json['success']}"

    # Validate top-level tokens with access_token and refresh_token
    assert "tokens" in resp_json, "Missing 'tokens' field in response"
    tokens = resp_json["tokens"]
    assert isinstance(tokens, dict), "'tokens' field is not an object"
    assert "access_token" in tokens, "Missing 'access_token' in tokens"
    assert isinstance(tokens["access_token"], str), "'access_token' is not string"
    assert len(tokens["access_token"]) > 0, "'access_token' is empty"
    assert "refresh_token" in tokens, "Missing 'refresh_token' in tokens"
    assert isinstance(tokens["refresh_token"], str), "'refresh_token' is not string"
    assert len(tokens["refresh_token"]) > 0, "'refresh_token' is empty"

test_TC_BE_001_health_login_seeded_credentials()
