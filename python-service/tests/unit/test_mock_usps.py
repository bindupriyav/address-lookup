"""Unit tests for the MockUSPSAdapter."""

import pytest

from app.adapters.mock_usps import MockUSPSAdapter
from app.models.address import StructuredAddress


@pytest.fixture
def adapter():
    """Create a MockUSPSAdapter instance."""
    return MockUSPSAdapter()


class TestDeterministicKnownAddress:
    """Tests for deterministic responses for known test addresses."""

    @pytest.mark.asyncio
    async def test_known_address_returns_deterministic_standardized(self, adapter):
        """Known test address (1600 Pennsylvania Ave) returns deterministic response."""
        address = StructuredAddress(
            street_line_1="1600 Pennsylvania Ave NW",
            city="Washington",
            state="DC",
            zipcode="20500",
        )
        result = await adapter.validate_address(address)
        assert result.status == "valid"
        assert result.standardized_address is not None
        assert result.standardized_address.street_line_1 == "1600 PENNSYLVANIA AVE NW"
        assert result.standardized_address.city == "WASHINGTON"
        assert result.standardized_address.state == "DC"
        assert result.standardized_address.zipcode == "20500"

    @pytest.mark.asyncio
    async def test_known_address_case_insensitive_lookup(self, adapter):
        """Known address lookup is case-insensitive on street_line_1."""
        address = StructuredAddress(
            street_line_1="1600 pennsylvania ave nw",
            city="washington",
            state="dc",
            zipcode="20500",
        )
        result = await adapter.validate_address(address)
        assert result.status == "valid"
        assert result.standardized_address.street_line_1 == "1600 PENNSYLVANIA AVE NW"


class TestInvalidKeywordHandling:
    """Tests for INVALID keyword rejection."""

    @pytest.mark.asyncio
    async def test_invalid_keyword_in_street_returns_invalid(self, adapter):
        """Address with INVALID in street_line_1 returns invalid status."""
        address = StructuredAddress(
            street_line_1="INVALID 123 Main St",
            city="Springfield",
            state="IL",
            zipcode="62701",
        )
        result = await adapter.validate_address(address)
        assert result.status == "invalid"
        assert result.standardized_address is None
        assert result.error_message is not None

    @pytest.mark.asyncio
    async def test_invalid_keyword_anywhere_in_street(self, adapter):
        """INVALID keyword anywhere in street_line_1 triggers rejection."""
        address = StructuredAddress(
            street_line_1="123 INVALID Street",
            city="Springfield",
            state="IL",
            zipcode="62701",
        )
        result = await adapter.validate_address(address)
        assert result.status == "invalid"

    @pytest.mark.asyncio
    async def test_invalid_lowercase_does_not_trigger_rejection(self, adapter):
        """Lowercase 'invalid' in street_line_1 does NOT trigger rejection."""
        address = StructuredAddress(
            street_line_1="123 invalid Street",
            city="Springfield",
            state="IL",
            zipcode="62701",
        )
        result = await adapter.validate_address(address)
        assert result.status == "valid"


class TestStandardizedUppercase:
    """Tests for standardized uppercase response for arbitrary addresses."""

    @pytest.mark.asyncio
    async def test_arbitrary_address_uppercased(self, adapter):
        """Arbitrary addresses are standardized to uppercase."""
        address = StructuredAddress(
            street_line_1="456 Oak Avenue",
            city="Portland",
            state="or",
            zipcode="97201",
        )
        result = await adapter.validate_address(address)
        assert result.status == "valid"
        assert result.standardized_address.street_line_1 == "456 OAK AVENUE"
        assert result.standardized_address.city == "PORTLAND"
        assert result.standardized_address.state == "OR"

    @pytest.mark.asyncio
    async def test_street_line_2_uppercased_when_present(self, adapter):
        """street_line_2 is uppercased when present."""
        address = StructuredAddress(
            street_line_1="789 Elm St",
            street_line_2="Apt 4b",
            city="Austin",
            state="TX",
            zipcode="73301",
        )
        result = await adapter.validate_address(address)
        assert result.standardized_address.street_line_2 == "APT 4B"

    @pytest.mark.asyncio
    async def test_street_line_2_none_preserved(self, adapter):
        """street_line_2 stays None when not provided."""
        address = StructuredAddress(
            street_line_1="789 Elm St",
            city="Austin",
            state="TX",
            zipcode="73301",
        )
        result = await adapter.validate_address(address)
        assert result.standardized_address.street_line_2 is None

    @pytest.mark.asyncio
    async def test_preserves_original_address(self, adapter):
        """The original_address in the result matches the input."""
        address = StructuredAddress(
            street_line_1="100 lower case rd",
            city="smalltown",
            state="ca",
            zipcode="90001",
        )
        result = await adapter.validate_address(address)
        assert result.original_address == address


class TestVerifyZipcodeCity:
    """Tests for verify_zipcode_city method."""

    @pytest.mark.asyncio
    async def test_known_pair_returns_match(self, adapter):
        """Known zipcode-city pair returns match status."""
        result = await adapter.verify_zipcode_city("20500", "Washington")
        assert result.status == "match"
        assert result.city == "WASHINGTON"

    @pytest.mark.asyncio
    async def test_known_pair_case_insensitive(self, adapter):
        """City matching is case-insensitive."""
        result = await adapter.verify_zipcode_city("10001", "new york")
        assert result.status == "match"

    @pytest.mark.asyncio
    async def test_mismatch_returns_valid_cities(self, adapter):
        """Mismatched city returns mismatch with valid_cities list."""
        result = await adapter.verify_zipcode_city("20500", "New York")
        assert result.status == "mismatch"
        assert result.valid_cities is not None
        assert "WASHINGTON" in result.valid_cities

    @pytest.mark.asyncio
    async def test_unknown_zipcode_returns_mismatch(self, adapter):
        """Unknown zipcode returns mismatch with UNKNOWN in valid_cities."""
        result = await adapter.verify_zipcode_city("99999", "Anywhere")
        assert result.status == "mismatch"
        assert "UNKNOWN" in result.valid_cities

    @pytest.mark.asyncio
    async def test_zip_plus_four_uses_first_five(self, adapter):
        """Zip+4 format uses first 5 digits for lookup."""
        result = await adapter.verify_zipcode_city("20500-0001", "Washington")
        assert result.status == "match"
