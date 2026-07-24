"""Property-based tests for missing required fields detection.

Feature: usps-address-validation, Property 2: Missing required fields are correctly identified
Validates: Requirements 1.3
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

# Strategy for non-empty safe text strings (valid field values)
_non_empty_safe_text = st.text(alphabet=_SAFE_ALPHABET, min_size=1, max_size=50)

# The required fields that must be non-empty
_REQUIRED_FIELDS = ["street_line_1", "city", "state", "zipcode"]


# Strategy that generates a non-empty subset of required fields to leave empty.
# At least one required field will be empty.
_missing_field_subsets = st.lists(
    st.sampled_from(_REQUIRED_FIELDS),
    min_size=1,
    max_size=4,
    unique=True,
)


@st.composite
def address_with_missing_fields(draw):
    """Generate a StructuredAddress where at least one required field is empty.

    Returns a tuple of (address, set of missing field names).
    """
    # Decide which required fields will be empty
    missing_fields = draw(_missing_field_subsets)
    missing_set = set(missing_fields)

    # Generate values: empty string for missing fields, non-empty for others
    street_line_1 = "" if "street_line_1" in missing_set else draw(_non_empty_safe_text)
    city = "" if "city" in missing_set else draw(_non_empty_safe_text)
    state = "" if "state" in missing_set else draw(_non_empty_safe_text)
    zipcode = "" if "zipcode" in missing_set else draw(_non_empty_safe_text)

    # street_line_2 is optional, generate normally
    street_line_2 = draw(st.one_of(st.none(), _non_empty_safe_text))

    address = StructuredAddress(
        street_line_1=street_line_1,
        street_line_2=street_line_2,
        city=city,
        state=state,
        zipcode=zipcode,
    )

    return address, missing_set


@given(data=address_with_missing_fields())
@settings(max_examples=10)
def test_missing_required_fields_detected(data):
    """Property 2: Missing required fields are correctly identified.

    For any StructuredAddress with one or more required fields
    (street_line_1, city, state, zipcode) set to empty string, the
    Address_Validator SHALL return a ValidationResult with status
    "invalid_input" and an error_message listing exactly the missing fields.

    Validates: Requirements 1.3
    """
    address, expected_missing = data
    adapter = MockUSPSAdapter()
    validator = AddressValidator(usps_adapter=adapter)

    result = asyncio.run(validator.validate(address))

    # Status must be "invalid_input"
    assert result.status == "invalid_input"

    # Original address must be preserved
    assert result.original_address == address

    # No standardized address should be returned
    assert result.standardized_address is None

    # Error message must be present
    assert result.error_message is not None

    # Error message must mention all and only the missing fields
    for field in expected_missing:
        assert field in result.error_message, (
            f"Expected field '{field}' to be mentioned in error_message: {result.error_message}"
        )

    # Ensure no extra required fields are mentioned that aren't actually missing
    for field in _REQUIRED_FIELDS:
        if field not in expected_missing:
            assert field not in result.error_message, (
                f"Field '{field}' should NOT be mentioned in error_message: {result.error_message}"
            )
