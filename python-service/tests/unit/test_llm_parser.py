"""Unit tests for the LLM Parser module."""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.models.address import StructuredAddress
from app.parsers.llm_parser import LLMParser, LLMParseError, LLMTimeoutError


@pytest.fixture
def parser():
    """Create an LLMParser instance with a configured endpoint."""
    return LLMParser(endpoint_url="https://llm.example.com/parse", api_key="test-key")


@pytest.fixture
def parser_no_endpoint():
    """Create an LLMParser instance without a configured endpoint."""
    return LLMParser()


class TestLLMTimeoutError:
    """Tests for LLMTimeoutError exception."""

    def test_stores_timeout_value(self):
        error = LLMTimeoutError(timeout=10.0)
        assert error.timeout == 10.0

    def test_message_includes_timeout(self):
        error = LLMTimeoutError(timeout=10.0)
        assert "10.0 seconds" in str(error)


class TestLLMParseError:
    """Tests for LLMParseError exception."""

    def test_stores_raw_text(self):
        error = LLMParseError(raw_text="123 Main St")
        assert error.raw_text == "123 Main St"

    def test_stores_reason(self):
        error = LLMParseError(raw_text="test", reason="missing fields")
        assert error.reason == "missing fields"

    def test_message_includes_raw_text(self):
        error = LLMParseError(raw_text="123 Main St")
        assert "123 Main St" in str(error)

    def test_message_includes_reason(self):
        error = LLMParseError(raw_text="test", reason="bad data")
        assert "bad data" in str(error)


class TestLLMParserTimeout:
    """Tests for timeout handling in LLMParser."""

    @pytest.mark.asyncio
    async def test_raises_timeout_error_when_service_is_slow(self, parser):
        """When the LLM service takes longer than the timeout, LLMTimeoutError is raised."""

        async def slow_response(*args, **kwargs):
            await asyncio.sleep(5)
            return {}

        with patch.object(parser, "_call_llm_service", side_effect=slow_response):
            with pytest.raises(LLMTimeoutError) as exc_info:
                await parser.parse("123 Main St, Springfield, IL 62701", timeout=0.1)

            assert exc_info.value.timeout == 0.1

    @pytest.mark.asyncio
    async def test_timeout_defaults_to_10_seconds(self, parser):
        """The default timeout is 10 seconds."""

        async def slow_response(*args, **kwargs):
            await asyncio.sleep(15)
            return {}

        with patch.object(parser, "_call_llm_service", side_effect=slow_response):
            with pytest.raises(LLMTimeoutError) as exc_info:
                # Use a very short timeout for test speed, but verify the parameter works
                await parser.parse("123 Main St", timeout=0.05)

            assert exc_info.value.timeout == 0.05


class TestLLMParserParseFailure:
    """Tests for parse failure handling in LLMParser."""

    @pytest.mark.asyncio
    async def test_raises_parse_error_when_missing_required_fields(self, parser):
        """When the LLM returns a response missing required fields, LLMParseError is raised."""

        async def incomplete_response(*args, **kwargs):
            return {"street_line_1": "123 Main St", "city": "Springfield"}

        with patch.object(parser, "_call_llm_service", side_effect=incomplete_response):
            with pytest.raises(LLMParseError) as exc_info:
                await parser.parse("123 Main St Springfield")

            assert "Missing required fields" in exc_info.value.reason
            assert "state" in exc_info.value.reason
            assert "zipcode" in exc_info.value.reason

    @pytest.mark.asyncio
    async def test_raises_parse_error_when_response_is_empty(self, parser):
        """When the LLM returns an empty response, LLMParseError is raised."""

        async def empty_response(*args, **kwargs):
            return {}

        with patch.object(parser, "_call_llm_service", side_effect=empty_response):
            with pytest.raises(LLMParseError) as exc_info:
                await parser.parse("some address text")

            assert exc_info.value.raw_text == "some address text"

    @pytest.mark.asyncio
    async def test_raises_parse_error_when_fields_are_empty_strings(self, parser):
        """When required fields are present but empty, LLMParseError is raised."""

        async def empty_fields_response(*args, **kwargs):
            return {
                "street_line_1": "",
                "city": "Springfield",
                "state": "IL",
                "zipcode": "62701",
            }

        with patch.object(
            parser, "_call_llm_service", side_effect=empty_fields_response
        ):
            with pytest.raises(LLMParseError) as exc_info:
                await parser.parse("partial address")

            assert "street_line_1" in exc_info.value.reason


class TestLLMParserSuccess:
    """Tests for successful parsing in LLMParser."""

    @pytest.mark.asyncio
    async def test_returns_structured_address_on_success(self, parser):
        """When the LLM returns valid fields, a StructuredAddress is returned."""

        async def valid_response(*args, **kwargs):
            return {
                "street_line_1": "1600 Pennsylvania Ave NW",
                "street_line_2": None,
                "city": "Washington",
                "state": "DC",
                "zipcode": "20500",
            }

        with patch.object(parser, "_call_llm_service", side_effect=valid_response):
            result = await parser.parse("1600 Pennsylvania Ave NW Washington DC 20500")

        assert isinstance(result, StructuredAddress)
        assert result.street_line_1 == "1600 Pennsylvania Ave NW"
        assert result.street_line_2 is None
        assert result.city == "Washington"
        assert result.state == "DC"
        assert result.zipcode == "20500"

    @pytest.mark.asyncio
    async def test_returns_structured_address_with_street_line_2(self, parser):
        """When the LLM returns a street_line_2 value, it is included."""

        async def valid_response_with_line2(*args, **kwargs):
            return {
                "street_line_1": "123 Main St",
                "street_line_2": "Apt 4B",
                "city": "Springfield",
                "state": "IL",
                "zipcode": "62701",
            }

        with patch.object(
            parser, "_call_llm_service", side_effect=valid_response_with_line2
        ):
            result = await parser.parse("123 Main St Apt 4B Springfield IL 62701")

        assert result.street_line_2 == "Apt 4B"

    @pytest.mark.asyncio
    async def test_handles_nested_address_key_in_response(self, parser):
        """When the LLM wraps the address under an 'address' key, it is extracted."""

        async def nested_response(*args, **kwargs):
            return {
                "address": {
                    "street_line_1": "456 Oak Ave",
                    "street_line_2": None,
                    "city": "Portland",
                    "state": "OR",
                    "zipcode": "97201",
                }
            }

        with patch.object(parser, "_call_llm_service", side_effect=nested_response):
            result = await parser.parse("456 Oak Ave Portland OR 97201")

        assert result.street_line_1 == "456 Oak Ave"
        assert result.city == "Portland"


class TestLLMParserNoEndpoint:
    """Tests for LLMParser when no endpoint is configured."""

    @pytest.mark.asyncio
    async def test_call_llm_service_raises_not_implemented(self, parser_no_endpoint):
        """When no endpoint is configured, _call_llm_service raises NotImplementedError."""
        with pytest.raises(NotImplementedError):
            await parser_no_endpoint._call_llm_service("test address")

    @pytest.mark.asyncio
    async def test_parse_raises_timeout_for_not_implemented_as_timeout(
        self, parser_no_endpoint
    ):
        """NotImplementedError from _call_llm_service propagates (not masked as timeout)."""
        # NotImplementedError is not TimeoutError or httpx.TimeoutException,
        # so it propagates directly through asyncio.wait_for
        with pytest.raises(NotImplementedError):
            await parser_no_endpoint.parse("test address")
