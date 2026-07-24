"""Property-based tests for MockUSPSAdapter behavior.

Feature: usps-address-validation, Property 4: Mock adapter rejects addresses with INVALID keyword
Validates: Requirements 3.3
"""

import asyncio
import string

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.adapters.mock_usps import MockUSPSAdapter
from app.models.address import StructuredAddress

# Alphabet for generating realistic address text (printable minus problematic chars)
_SAFE_ALPHABET = st.sampled_from(
    [c for c in string.printable if c not in "\t\n\r\x0b\x0c"]
)

# Strategy for non-empty safe text strings
_non_empty_safe_text = st.text(alphabet=_SAFE_ALPHABET, min_size=1, max_size=50)

# Strategy for street_line_1 that contains "INVALID" somewhere in it
_street_with_invalid = st.builds(
    lambda prefix, suffix: f"{prefix}INVALID{suffix}",
    prefix=st.text(alphabet=_SAFE_ALPHABET, min_size=0, max_size=20),
    suffix=st.text(alphabet=_SAFE_ALPHABET, min_size=0, max_size=20),
)

# Strategy for StructuredAddress with INVALID in street_line_1
_address_with_invalid_street = st.builds(
    StructuredAddress,
    street_line_1=_street_with_invalid,
    street_line_2=st.one_of(st.none(), _non_empty_safe_text),
    city=_non_empty_safe_text,
    state=_non_empty_safe_text,
    zipcode=_non_empty_safe_text,
)


@given(address=_address_with_invalid_street)
@settings(max_examples=10)
def test_mock_adapter_rejects_invalid_keyword(address: StructuredAddress):
    """Property 4: Mock adapter rejects addresses with INVALID keyword.

    For any StructuredAddress where street_line_1 contains the substring
    "INVALID", the Mock_USPS_Adapter SHALL return a ValidationResult with
    status "invalid".

    Validates: Requirements 3.3
    """
    adapter = MockUSPSAdapter()
    result = asyncio.run(adapter.validate_address(address))

    assert result.status == "invalid"
    assert result.original_address == address
    assert result.standardized_address is None
