"""Integration tests for POST /api/v1/validate/parse endpoint."""

import pytest
from unittest.mock import patch, AsyncMock

from fastapi.testclient import TestClient

from app.main import app
from app.models.address import StructuredAddress
from app.parsers.llm_parser import LLMParseError, LLMTimeoutError

client = TestClient(app)


class TestParseEndpoint:
    """Tests for the parse and validate endpoint."""

    def test_successful_parse_and_validate(self):
        """When LLM parses successfully, the parsed address is validated via USPS."""
        mock_address = StructuredAddress(
            street_line_1="1600 Pennsylvania Ave",
            street_line_2=None,
            city="Washington",
            state="DC",
            zipcode="20500",
        )

        with patch(
            "app.routes.parse.LLMParser.parse",
            new_callable=AsyncMock,
            return_value=mock_address,
        ):
            resp = client.post(
                "/api/v1/validate/parse",
                json={"raw_address": "1600 Pennsylvania Ave Washington DC 20500"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] in ("valid", "invalid")
        assert data["parsed_address"] is not None
        assert data["parsed_address"]["street_line_1"] == "1600 Pennsylvania Ave"
        assert data["validation_result"] is not None
        assert data["raw_text"] == "1600 Pennsylvania Ave Washington DC 20500"

    def test_parse_failure_returns_parse_failed(self):
        """When LLM cannot parse the text, status is 'parse_failed'."""
        with patch(
            "app.routes.parse.LLMParser.parse",
            new_callable=AsyncMock,
            side_effect=LLMParseError(raw_text="gibberish text", reason="could not extract"),
        ):
            resp = client.post(
                "/api/v1/validate/parse",
                json={"raw_address": "gibberish text"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "parse_failed"
        assert data["parsed_address"] is None
        assert data["validation_result"] is None
        assert data["raw_text"] == "gibberish text"

    def test_llm_timeout_returns_service_unavailable(self):
        """When LLM times out, status is 'service_unavailable'."""
        with patch(
            "app.routes.parse.LLMParser.parse",
            new_callable=AsyncMock,
            side_effect=LLMTimeoutError(timeout=10.0),
        ):
            resp = client.post(
                "/api/v1/validate/parse",
                json={"raw_address": "123 Main St Springfield IL 62701"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "service_unavailable"
        assert data["parsed_address"] is None
        assert data["validation_result"] is None
        assert "unavailable" in data["error_message"].lower()

    def test_missing_raw_address_field_returns_422(self):
        """When raw_address is not provided in the body, FastAPI returns 422."""
        resp = client.post(
            "/api/v1/validate/parse",
            json={},
        )
        assert resp.status_code == 422

    def test_parsed_invalid_address_returns_invalid_status(self):
        """When parsed address contains INVALID keyword, USPS returns invalid."""
        mock_address = StructuredAddress(
            street_line_1="123 INVALID Street",
            street_line_2=None,
            city="Nowhere",
            state="XX",
            zipcode="00000",
        )

        with patch(
            "app.routes.parse.LLMParser.parse",
            new_callable=AsyncMock,
            return_value=mock_address,
        ):
            resp = client.post(
                "/api/v1/validate/parse",
                json={"raw_address": "123 INVALID Street Nowhere XX 00000"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "invalid"
        assert data["validation_result"]["status"] == "invalid"
