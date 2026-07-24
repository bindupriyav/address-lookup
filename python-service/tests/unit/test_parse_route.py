"""Unit tests for the parse endpoint route."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.address import StructuredAddress
from app.models.validation import ValidationResult
from app.parsers.llm_parser import LLMParser, LLMParseError, LLMTimeoutError
from app.routes.parse import _get_address_validator, _get_llm_parser


@pytest.fixture
def client():
    """Create a FastAPI test client with clean dependency overrides."""
    yield TestClient(app)
    # Clean up overrides after each test
    app.dependency_overrides.clear()


class TestParseEndpointSuccess:
    """Tests for successful parse + validate flow."""

    def test_returns_valid_when_parse_and_validate_succeed(self, client):
        """When LLM parses and USPS validates, returns status 'valid' with both results."""
        parsed = StructuredAddress(
            street_line_1="123 Main St",
            city="Springfield",
            state="IL",
            zipcode="62701",
        )
        validation = ValidationResult(
            original_address=parsed,
            standardized_address=StructuredAddress(
                street_line_1="123 MAIN ST",
                city="SPRINGFIELD",
                state="IL",
                zipcode="62701",
            ),
            status="valid",
        )

        # Override LLM parser dependency
        mock_parser = AsyncMock(spec=LLMParser)
        mock_parser.parse.return_value = parsed
        app.dependency_overrides[_get_llm_parser] = lambda: mock_parser

        # Override address validator dependency
        mock_validator = AsyncMock()
        mock_validator.validate.return_value = validation
        app.dependency_overrides[_get_address_validator] = lambda: mock_validator

        resp = client.post(
            "/api/v1/validate/parse",
            json={"raw_address": "123 Main St Springfield IL 62701"},
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "valid"
        assert body["raw_text"] == "123 Main St Springfield IL 62701"
        assert body["parsed_address"] is not None
        assert body["parsed_address"]["street_line_1"] == "123 Main St"
        assert body["validation_result"] is not None
        assert body["validation_result"]["status"] == "valid"

    def test_returns_invalid_when_usps_rejects(self, client):
        """When LLM parses but USPS rejects, returns status 'invalid'."""
        parsed = StructuredAddress(
            street_line_1="INVALID St",
            city="Springfield",
            state="IL",
            zipcode="62701",
        )
        validation = ValidationResult(
            original_address=parsed,
            standardized_address=None,
            status="invalid",
            error_message="Address not found",
        )

        mock_parser = AsyncMock(spec=LLMParser)
        mock_parser.parse.return_value = parsed
        app.dependency_overrides[_get_llm_parser] = lambda: mock_parser

        mock_validator = AsyncMock()
        mock_validator.validate.return_value = validation
        app.dependency_overrides[_get_address_validator] = lambda: mock_validator

        resp = client.post(
            "/api/v1/validate/parse",
            json={"raw_address": "INVALID St Springfield IL 62701"},
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "invalid"
        assert body["parsed_address"] is not None
        assert body["validation_result"] is not None
        assert body["error_message"] == "Address not found"


class TestParseEndpointFailures:
    """Tests for error handling in parse endpoint."""

    def test_returns_parse_failed_on_llm_parse_error(self, client):
        """When LLM fails to parse, returns status 'parse_failed'."""
        mock_parser = AsyncMock(spec=LLMParser)
        mock_parser.parse.side_effect = LLMParseError(
            raw_text="gibberish text", reason="Could not extract address"
        )
        app.dependency_overrides[_get_llm_parser] = lambda: mock_parser

        resp = client.post(
            "/api/v1/validate/parse",
            json={"raw_address": "gibberish text"},
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "parse_failed"
        assert body["raw_text"] == "gibberish text"
        assert body["parsed_address"] is None
        assert body["validation_result"] is None
        assert body["error_message"] is not None

    def test_returns_service_unavailable_on_llm_timeout(self, client):
        """When LLM times out, returns status 'service_unavailable'."""
        mock_parser = AsyncMock(spec=LLMParser)
        mock_parser.parse.side_effect = LLMTimeoutError(timeout=10.0)
        app.dependency_overrides[_get_llm_parser] = lambda: mock_parser

        resp = client.post(
            "/api/v1/validate/parse",
            json={"raw_address": "123 Main St Springfield IL 62701"},
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "service_unavailable"
        assert body["raw_text"] == "123 Main St Springfield IL 62701"
        assert body["parsed_address"] is None
        assert body["validation_result"] is None
        assert body["error_message"] == "LLM service is unavailable"

    def test_returns_service_unavailable_on_not_implemented(self, client):
        """When LLM endpoint is not configured, returns 'service_unavailable'."""
        # No dependency overrides — uses the default LLMParser with no endpoint
        resp = client.post(
            "/api/v1/validate/parse",
            json={"raw_address": "123 Main St Springfield IL 62701"},
        )

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "service_unavailable"
        assert body["error_message"] == "LLM service is unavailable"


class TestParseEndpointValidation:
    """Tests for request validation in parse endpoint."""

    def test_returns_422_when_raw_address_missing(self, client):
        """When raw_address is not provided, returns 422 validation error."""
        resp = client.post("/api/v1/validate/parse", json={})
        assert resp.status_code == 422

    def test_returns_422_when_body_is_invalid(self, client):
        """When body has wrong type, returns 422 validation error."""
        resp = client.post(
            "/api/v1/validate/parse", json={"raw_address": 123}
        )
        assert resp.status_code == 422
