import requests

BASE_URL = "http://localhost/api"
LOGIN_ENDPOINT = "/auth/health/login"
TIMEOUT = 30

def test_health_login_success():
    url = BASE_URL + LOGIN_ENDPOINT
    headers = {
        "Content-Type": "application/json"
    }
    # Use seeded test credentials from this environment
    payload = {
        "healthId": "1100100100011",
        "password": "Test@12345"
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
        response.raise_for_status()
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    # Validate response status code
    assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"

    try:
        response_json = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    # Validate success field
    assert "success" in response_json, "Response missing 'success' field"
    assert response_json["success"] is True, f"Expected success=True, got {response_json['success']}"

    # Validate presence of tokens in response
    assert "tokens" in response_json, "Response missing 'tokens' field"
    tokens = response_json["tokens"]
    assert isinstance(tokens, dict), "'tokens' should be a dictionary"

    # Validate expected token fields (assuming typical token names)
    assert "access_token" in tokens, "Missing 'access_token' in tokens"
    assert isinstance(tokens["access_token"], str) and tokens["access_token"], "'access_token' should be a non-empty string"

    assert "refresh_token" in tokens, "Missing 'refresh_token' in tokens"
    assert isinstance(tokens["refresh_token"], str) and tokens["refresh_token"], "'refresh_token' should be a non-empty string"


test_health_login_success()
