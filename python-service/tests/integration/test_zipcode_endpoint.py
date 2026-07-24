"""Integration tests for POST /api/v1/validate/zipcode-city endpoint."""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestZipcodeCityEndpoint:
    """Tests for the zipcode-city verification endpoint."""

    def test_matching_zipcode_city_returns_match(self):
        """A known matching zipcode-city pair should return status 'match'."""
        resp = client.post(
            "/api/v1/validate/zipcode-city",
            json={"zipcode": "20500", "city": "Washington"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "match"
        assert data["zipcode"] == "20500"
        assert data["city"] == "WASHINGTON"

    def test_mismatched_zipcode_city_returns_mismatch(self):
        """A mismatched zipcode-city pair should return status 'mismatch' with valid_cities."""
        resp = client.post(
            "/api/v1/validate/zipcode-city",
            json={"zipcode": "20500", "city": "Los Angeles"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "mismatch"
        assert data["valid_cities"] is not None
        assert "WASHINGTON" in data["valid_cities"]

    def test_five_plus_four_zipcode_format_accepted(self):
        """A 5+4 zipcode format should be accepted and processed."""
        resp = client.post(
            "/api/v1/validate/zipcode-city",
            json={"zipcode": "20500-0001", "city": "Washington"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "match"
        assert data["zipcode"] == "20500-0001"

    def test_invalid_zipcode_format_returns_400(self):
        """A zipcode that doesn't match 5-digit or 5+4 format should return 400."""
        resp = client.post(
            "/api/v1/validate/zipcode-city",
            json={"zipcode": "123", "city": "Washington"},
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert detail["error_code"] == "INVALID_ZIPCODE_FORMAT"

    def test_letters_in_zipcode_returns_400(self):
        """A zipcode containing letters should return 400."""
        resp = client.post(
            "/api/v1/validate/zipcode-city",
            json={"zipcode": "ABCDE", "city": "Washington"},
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert detail["error_code"] == "INVALID_ZIPCODE_FORMAT"

    def test_six_digit_zipcode_returns_400(self):
        """A zipcode with 6 digits should return 400."""
        resp = client.post(
            "/api/v1/validate/zipcode-city",
            json={"zipcode": "123456", "city": "Washington"},
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert detail["error_code"] == "INVALID_ZIPCODE_FORMAT"

    def test_unknown_zipcode_returns_mismatch(self):
        """An unknown zipcode should return mismatch with fallback valid_cities."""
        resp = client.post(
            "/api/v1/validate/zipcode-city",
            json={"zipcode": "99999", "city": "Anytown"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "mismatch"
        assert data["valid_cities"] is not None

    def test_missing_body_fields_returns_422(self):
        """Missing required body fields should return 422 (FastAPI validation)."""
        resp = client.post(
            "/api/v1/validate/zipcode-city",
            json={},
        )
        assert resp.status_code == 422

    def test_case_insensitive_city_matching(self):
        """City matching should be case-insensitive."""
        resp = client.post(
            "/api/v1/validate/zipcode-city",
            json={"zipcode": "10001", "city": "new york"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "match"

