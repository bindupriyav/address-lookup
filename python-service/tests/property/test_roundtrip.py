"""Property-based tests for StructuredAddress round-trip serialization.

Feature: usps-address-validation, Property 7: StructuredAddress serialization round-trip
Validates: Requirements 8.8
"""

import string

from hypothesis import given, settings
from hypothesis import strategies as st

from app.models.address import StructuredAddress

# Alphabet that excludes the pipe delimiter character
# Using printable characters minus pipe to generate realistic address text
_SAFE_ALPHABET = st.sampled_from(
    [c for c in string.printable if c != "|" and c not in "\t\n\r\x0b\x0c"]
)

# Strategy for non-empty strings without pipe characters
_non_empty_safe_text = st.text(alphabet=_SAFE_ALPHABET, min_size=1, max_size=50)

# Strategy for optional street_line_2: either None or a non-empty safe string
# (empty string is excluded because from_string maps empty to None)
_optional_safe_text = st.one_of(st.none(), _non_empty_safe_text)


# Strategy for generating valid StructuredAddress instances
_structured_address_strategy = st.builds(
    StructuredAddress,
    street_line_1=_non_empty_safe_text,
    street_line_2=_optional_safe_text,
    city=_non_empty_safe_text,
    state=_non_empty_safe_text,
    zipcode=_non_empty_safe_text,
)


@given(address=_structured_address_strategy)
@settings(max_examples=10)
def test_structured_address_roundtrip_serialization(address: StructuredAddress):
    """Property 7: StructuredAddress serialization round-trip.

    For any valid StructuredAddress, serializing it to a formatted string
    and then parsing that string back into a StructuredAddress SHALL produce
    an object equivalent to the original.

    Validates: Requirements 8.8
    """
    serialized = address.to_string()
    deserialized = StructuredAddress.from_string(serialized)

    assert deserialized.street_line_1 == address.street_line_1
    assert deserialized.street_line_2 == address.street_line_2
    assert deserialized.city == address.city
    assert deserialized.state == address.state
    assert deserialized.zipcode == address.zipcode
    assert deserialized == address
