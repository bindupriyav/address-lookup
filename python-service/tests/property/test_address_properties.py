"""Property-based tests for AddressValidator behavior.

Feature: usps-address-validation, Property 1: Valid address validation produces standardized result
Validates: Requirements 1.1
"""

import asyncio
import string

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.adapters.mock_usps import MockUSPSAdapter
from app.models.address import StructuredAddress
from app.services.address_validator import AddressValidator

# Alphabet for generating realistic address text (printable minus problematic chars)
_SAFE_ALPHABET = st.sampled_from(
    [c for c in string.printable if c not in "\t\n\r\x0b\x0c"]
)

# Strategy for non-empty safe text strings (without "INVALID" substring)
_non_empty_safe_text = st.text(alphabet=_SAFE_ALPHABET, min_size=1, max_size=50)


def _does_not_contain_invalid(s: str) -> bool:
    """Filter out strings containing 'INVALID' substring."""
    return "INVALID" not in s


# Strategy for street_line_1 that does NOT contain "INVALID"
_valid_street_line_1 = _non_empty_safe_text.filter(_does_not_contain_invalid)

# Strategy for a valid StructuredAddress (all required fields present, no INVALID keyword)
_valid_address = st.builds(
    StructuredAddress,
    street_line_1=_valid_street_line_1,
    street_line_2=st.one_of(st.none(), _non_empty_safe_text),
    city=_non_empty_safe_text,
    state=_non_empty_safe_text,
    zipcode=_non_empty_safe_text,
)


@pytest.mark.asyncio
@given(address=_valid_address)
@settings(max_examples=10)
async def test_valid_address_validation_produces_standardized_result(
    address: StructuredAddress,
):
    """Property 1: Valid address validation produces standardized result.

    For any valid StructuredAddress (all required fields present, no "INVALID"
    keyword), when submitted to the Address_Validator with a mock USPS adapter,
    the returned ValidationResult SHALL have status "valid" and a non-null
    standardized_address.

    Feature: usps-address-validation, Property 1: Valid address validation produces standardized result
    Validates: Requirements 1.1
    """
    adapter = MockUSPSAdapter()
    validator = AddressValidator(usps_adapter=adapter)

    result = await validator.validate(address)

    assert result.status == "valid", (
        f"Expected status 'valid' but got '{result.status}' for address: {address}"
    )
    assert result.standardized_address is not None, (
        f"Expected non-null standardized_address for valid address: {address}"
    )
