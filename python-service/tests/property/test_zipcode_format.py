# Feature: usps-address-validation, Property 3: Invalid zipcode formats are rejected
"""Property-based tests for invalid zipcode format rejection.

Feature: usps-address-validation, Property 3: Invalid zipcode formats are rejected
Validates: Requirements 2.4
"""

import re

from hypothesis import given, settings
from hypothesis import strategies as st
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

# Valid zipcode pattern: exactly 5 digits OR 5 digits + hyphen + 4 digits
_VALID_ZIPCODE_PATTERN = re.compile(r"^\d{5}(-\d{4})?$")


def _is_invalid_zipcode(s: str) -> bool:
    """Return True if the string does NOT match a valid zipcode format."""
    return not _VALID_ZIPCODE_PATTERN.match(s)


# Strategy to generate strings that are NOT valid zipcodes.
# We use a broad text strategy and filter out any that happen to be valid.
_invalid_zipcode_strategy = st.one_of(
    # Empty and whitespace strings
    st.just(""),
    st.text(alphabet=" \t\n", min_size=1, max_size=10),
    # Too few digits (1-4 digits)
    st.from_regex(r"^\d{1,4}$", fullmatch=True),
    # Too many digits (6-10 digits without a hyphen)
    st.from_regex(r"^\d{6,10}$", fullmatch=True),
    # Letters mixed with digits
    st.from_regex(r"^[a-zA-Z0-9]{1,10}$", fullmatch=True).filter(_is_invalid_zipcode),
    # 5 digits with wrong separator (not hyphen)
    st.from_regex(r"^\d{5}[./_ ]\d{4}$", fullmatch=True),
    # 5 digits with hyphen but wrong number of trailing digits (1-3 or 5+)
    st.from_regex(r"^\d{5}-\d{1,3}$", fullmatch=True),
    st.from_regex(r"^\d{5}-\d{5,8}$", fullmatch=True),
    # Alphanumeric strings
    st.from_regex(r"^[A-Z]{2,5}\d{0,3}$", fullmatch=True),
    # General text that's unlikely to be a valid zipcode
    st.text(min_size=1, max_size=20).filter(_is_invalid_zipcode),
).filter(_is_invalid_zipcode)


@given(invalid_zipcode=_invalid_zipcode_strategy)
@settings(max_examples=10)
def test_invalid_zipcode_format_rejected(invalid_zipcode: str):
    """Property 3: Invalid zipcode formats are rejected.

    For any string that does not match the pattern of exactly 5 digits or
    5 digits followed by a hyphen and 4 digits, the zipcode-city verification
    endpoint SHALL return a 400 error indicating invalid zipcode format.

    **Validates: Requirements 2.4**
    """
    resp = client.post(
        "/api/v1/validate/zipcode-city",
        json={
            "zipcode": invalid_zipcode,
            "city": "AnyCity",
        },
    )

    assert resp.status_code == 400, (
        f"Expected 400 for invalid zipcode '{invalid_zipcode}', got {resp.status_code}"
    )

    detail = resp.json()["detail"]
    assert detail["error_code"] == "INVALID_ZIPCODE_FORMAT", (
        f"Expected error_code 'INVALID_ZIPCODE_FORMAT' for zipcode '{invalid_zipcode}', "
        f"got '{detail['error_code']}'"
    )
