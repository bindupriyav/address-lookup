"""Integration tests for POST /api/v1/validate/address endpoint."""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestValidateAddressEndpoint:
    """Tests for the address validation endpoint."""

    def test_valid_address_returns_200(self):
        """A valid address should return 200 with a ValidationResult."""
        resp = client.post(
            "/api/v1/validate/address",
            json={
                "street_line_1": "1600 Pennsylvania Ave",
                "city": "Washington",
                "state": "DC",
                "zipcode": "20500",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] in ("valid", "invalid")
        assert data["original_address"]["street_line_1"] == "1600 Pennsylvania Ave"

    def test_missing_street_line_1_returns_400(self):
        """An empty street_line_1 should return 400 with MISSING_FIELDS."""
        resp = client.post(
            "/api/v1/validate/address",
            json={
                "street_line_1": "",
                "city": "Washington",
                "state": "DC",
                "zipcode": "20500",
            },
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert detail["error_code"] == "MISSING_FIELDS"
        assert "street_line_1" in detail["fields"]

    def test_missing_multiple_fields_returns_400(self):
        """Multiple empty required fields should all be listed."""
        resp = client.post(
            "/api/v1/validate/address",
            json={
                "street_line_1": "",
                "city": "",
                "state": "DC",
                "zipcode": "20500",
            },
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert detail["error_code"] == "MISSING_FIELDS"
        assert "street_line_1" in detail["fields"]
        assert "city" in detail["fields"]
        assert len(detail["fields"]) == 2

    def test_all_required_fields_empty_returns_400(self):
        """All empty required fields should be listed."""
        resp = client.post(
            "/api/v1/validate/address",
            json={
                "street_line_1": "",
                "city": "",
                "state": "",
                "zipcode": "",
            },
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert detail["error_code"] == "MISSING_FIELDS"
        assert len(detail["fields"]) == 4

    def test_invalid_address_returns_200_with_invalid_status(self):
        """An address with INVALID keyword returns 200 with status invalid."""
        resp = client.post(
            "/api/v1/validate/address",
            json={
                "street_line_1": "123 INVALID Street",
                "city": "Nowhere",
                "state": "XX",
                "zipcode": "00000",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "invalid"

    def test_whitespace_only_field_treated_as_missing(self):
        """A field with only whitespace should be treated as missing."""
        resp = client.post(
            "/api/v1/validate/address",
            json={
                "street_line_1": "   ",
                "city": "Washington",
                "state": "DC",
                "zipcode": "20500",
            },
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert "street_line_1" in detail["fields"]

    def test_optional_street_line_2_not_required(self):
        """street_line_2 is optional and should not cause errors when absent."""
        resp = client.post(
            "/api/v1/validate/address",
            json={
                "street_line_1": "1600 Pennsylvania Ave",
                "city": "Washington",
                "state": "DC",
                "zipcode": "20500",
            },
        )
        assert resp.status_code == 200

    def test_error_message_is_human_readable(self):
        """The error message should be human-readable."""
        resp = client.post(
            "/api/v1/validate/address",
            json={
                "street_line_1": "",
                "city": "Washington",
                "state": "DC",
                "zipcode": "20500",
            },
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert "message" in detail
        assert "street_line_1" in detail["message"]
