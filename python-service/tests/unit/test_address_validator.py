"""Unit tests for AddressValidator service."""

import pytest

from app.adapters.mock_usps import MockUSPSAdapter
from app.models.address import StructuredAddress
from app.services.address_validator import AddressValidator


@pytest.fixture
def validator():
    """Create an AddressValidator with the mock USPS adapter."""
    adapter = MockUSPSAdapter()
    return AddressValidator(usps_adapter=adapter)


class TestValidate:
    """Tests for AddressValidator.validate() method."""

    @pytest.mark.asyncio
    async def test_valid_address_returns_valid_status(self, validator):
        address = StructuredAddress(
            street_line_1="1600 Pennsylvania Ave NW",
            city="Washington",
            state="DC",
            zipcode="20500",
        )
        result = await validator.validate(address)
        assert result.status == "valid"
        assert result.standardized_address is not None

    @pytest.mark.asyncio
    async def test_invalid_address_returns_invalid_status(self, validator):
        address = StructuredAddress(
            street_line_1="INVALID ADDRESS",
            city="Nowhere",
            state="XX",
            zipcode="00000",
        )
        result = await validator.validate(address)
        assert result.status == "invalid"
        assert result.error_message is not None

    @pytest.mark.asyncio
    async def test_validate_preserves_original_address(self, validator):
        address = StructuredAddress(
            street_line_1="123 Main St",
            city="Springfield",
            state="IL",
            zipcode="62701",
        )
        result = await validator.validate(address)
        assert result.original_address == address


class TestVerifyZipcodeCity:
    """Tests for AddressValidator.verify_zipcode_city() method."""

    @pytest.mark.asyncio
    async def test_matching_city_returns_match(self, validator):
        result = await validator.verify_zipcode_city("20500", "Washington")
        assert result.status == "match"

    @pytest.mark.asyncio
    async def test_mismatched_city_returns_mismatch(self, validator):
        result = await validator.verify_zipcode_city("20500", "New York")
        assert result.status == "mismatch"
        assert result.valid_cities is not None

    @pytest.mark.asyncio
    async def test_mismatch_includes_valid_cities_list(self, validator):
        result = await validator.verify_zipcode_city("10001", "Chicago")
        assert result.status == "mismatch"
        assert "NEW YORK" in result.valid_cities


class TestCheckAddress:
    """Tests for AddressValidator.check_address() method."""

    def test_converts_to_uppercase(self, validator):
        assert validator.check_address("123 main st") == "123 MAIN ST"

    def test_already_uppercase_unchanged(self, validator):
        assert validator.check_address("123 MAIN ST") == "123 MAIN ST"

    def test_empty_string_returns_empty_string(self, validator):
        assert validator.check_address("") == ""

    def test_mixed_case(self, validator):
        assert validator.check_address("Hello World") == "HELLO WORLD"


class TestVerifyAddress:
    """Tests for AddressValidator.verify_address() method."""

    def test_converts_to_uppercase(self, validator):
        assert validator.verify_address("456 oak ave") == "456 OAK AVE"

    def test_already_uppercase_unchanged(self, validator):
        assert validator.verify_address("456 OAK AVE") == "456 OAK AVE"

    def test_empty_string_returns_empty_string(self, validator):
        assert validator.verify_address("") == ""

    def test_mixed_case(self, validator):
        assert validator.verify_address("Hello World") == "HELLO WORLD"
