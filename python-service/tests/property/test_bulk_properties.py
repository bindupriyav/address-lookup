"""Property-based tests for BulkProcessor behavior.

Feature: usps-address-validation, Property 5: Bulk validation preserves row count and order
Validates: Requirements 5.3

Feature: usps-address-validation, Property 6: Bulk rows with missing fields receive invalid_input status
Validates: Requirements 5.6
"""

import io
import string

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from openpyxl import Workbook

from fastapi import UploadFile

from app.adapters.mock_usps import MockUSPSAdapter
from app.models.address import StructuredAddress
from app.services.address_validator import AddressValidator
from app.services.bulk_processor import BulkProcessor


# --- Constants ---

# Required address fields that must be present in each row
_REQUIRED_FIELDS = ["street_line_1", "city", "state", "zipcode"]

# --- Strategies ---

# Safe alphabet for generating address text (printable, no tabs/newlines)
_SAFE_CHARS = [c for c in string.printable if c not in "\t\n\r\x0b\x0c"]

# Non-empty text without "INVALID" substring (to avoid invalid status path)
# Also filter out strings starting with '=' which openpyxl treats as formulas
# Filter out strings with leading/trailing whitespace since the bulk processor strips cell values
_non_empty_text = st.text(
    alphabet=st.sampled_from(_SAFE_CHARS), min_size=1, max_size=30
).filter(lambda s: "INVALID" not in s and not s.startswith("=") and s.strip() == s and len(s.strip()) > 0)

# US state abbreviations for realistic data
_state = st.sampled_from(["CA", "NY", "TX", "FL", "IL", "WA", "DC", "PA", "OH", "GA"])

# 5-digit zipcode
_zipcode = st.from_regex(r"[0-9]{5}", fullmatch=True)

# Strategy for a valid address row (all required fields present)
_valid_address_row = st.fixed_dictionaries({
    "street_line_1": _non_empty_text,
    "street_line_2": st.one_of(st.just(""), _non_empty_text),
    "city": _non_empty_text,
    "state": _state,
    "zipcode": _zipcode,
})

# Strategy for a list of address rows (1 to 10 for test speed)
_address_rows = st.lists(_valid_address_row, min_size=1, max_size=10)


# --- Helpers ---

def _create_excel_bytes(rows: list) -> bytes:
    """Create an in-memory .xlsx file from a list of address row dicts.

    The first row is the header, subsequent rows contain address data.
    Returns raw bytes of the Excel file.
    """
    wb = Workbook()
    ws = wb.active
    # Write header
    headers = ["street_line_1", "street_line_2", "city", "state", "zipcode"]
    ws.append(headers)
    # Write data rows
    for row in rows:
        ws.append([row[h] for h in headers])
    # Save to bytes
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.read()


def _create_upload_file(excel_bytes: bytes, filename: str = "addresses.xlsx") -> UploadFile:
    """Create a FastAPI UploadFile from raw Excel bytes."""
    file_obj = io.BytesIO(excel_bytes)
    return UploadFile(filename=filename, file=file_obj)


# --- Property Test ---

@pytest.mark.asyncio
@given(rows=_address_rows)
@settings(max_examples=50)
async def test_bulk_validation_preserves_row_count_and_order(rows: list):
    """Property 5: Bulk validation preserves row count and order.

    For any valid Excel file with N address rows (where 1 <= N <= 1000),
    the BulkValidationResult SHALL contain exactly N ValidationResult entries,
    and the i-th result SHALL correspond to the i-th row of the input file.

    **Validates: Requirements 5.3**

    Feature: usps-address-validation, Property 5: Bulk validation preserves row count and order
    """
    # Arrange
    adapter = MockUSPSAdapter()
    validator = AddressValidator(usps_adapter=adapter)
    processor = BulkProcessor(validator=validator)

    excel_bytes = _create_excel_bytes(rows)
    upload_file = _create_upload_file(excel_bytes)

    # Act
    result = await processor.process_file(upload_file)

    # Assert: total_rows matches input row count
    assert result.total_rows == len(rows), (
        f"Expected total_rows={len(rows)}, got {result.total_rows}"
    )

    # Assert: results list length matches input row count
    assert len(result.results) == len(rows), (
        f"Expected {len(rows)} results, got {len(result.results)}"
    )

    # Assert: each result corresponds to the correct input row (order preserved)
    for i, (input_row, validation_result) in enumerate(zip(rows, result.results)):
        original = validation_result.original_address
        assert original.street_line_1 == input_row["street_line_1"], (
            f"Row {i}: street_line_1 mismatch. "
            f"Expected '{input_row['street_line_1']}', got '{original.street_line_1}'"
        )
        assert original.city == input_row["city"], (
            f"Row {i}: city mismatch. "
            f"Expected '{input_row['city']}', got '{original.city}'"
        )
        assert original.state == input_row["state"], (
            f"Row {i}: state mismatch. "
            f"Expected '{input_row['state']}', got '{original.state}'"
        )
        assert original.zipcode == input_row["zipcode"], (
            f"Row {i}: zipcode mismatch. "
            f"Expected '{input_row['zipcode']}', got '{original.zipcode}'"
        )


# --- Strategies for Property 6 ---

# Strategy to produce a row with at least one required field missing.
# We pick a non-empty subset of required fields to blank out.
_required_fields_subset = st.lists(
    st.sampled_from(_REQUIRED_FIELDS), min_size=1, unique=True
)


@st.composite
def _row_with_missing_fields(draw):
    """Generate a row where at least one required field is empty/missing.

    Returns a tuple of (row_dict, set_of_missing_field_names).
    """
    # Start from a fully-populated row
    row = draw(_valid_address_row)
    # Choose which required fields to blank out
    fields_to_remove = draw(_required_fields_subset)
    for field in fields_to_remove:
        row[field] = ""
    return row, set(fields_to_remove)


# Strategy for a list of rows with missing fields (1-5 rows for speed)
_rows_with_missing = st.lists(_row_with_missing_fields(), min_size=1, max_size=5)


# --- Property 6 Test ---

@pytest.mark.asyncio
@given(rows_with_info=_rows_with_missing)
@settings(max_examples=50)
async def test_bulk_rows_with_missing_fields_receive_invalid_input(rows_with_info):
    """Property 6: Bulk rows with missing fields receive invalid_input status.

    For any row in a bulk Excel file that is missing one or more required fields
    (street_line_1, city, state, zipcode), the corresponding ValidationResult
    SHALL have status "invalid_input" and an error_message describing which
    fields are missing.

    **Validates: Requirements 5.6**

    Feature: usps-address-validation, Property 6: Bulk rows with missing fields receive invalid_input status
    """
    # Separate row dicts from their expected-missing-fields metadata
    rows = [row for row, _ in rows_with_info]
    expected_missing = [missing for _, missing in rows_with_info]

    # Arrange
    adapter = MockUSPSAdapter()
    validator = AddressValidator(usps_adapter=adapter)
    processor = BulkProcessor(validator=validator)

    excel_bytes = _create_excel_bytes(rows)
    upload_file = _create_upload_file(excel_bytes)

    # Act
    result = await processor.process_file(upload_file)

    # Assert: one result per row
    assert len(result.results) == len(rows)

    # Assert: each row with missing fields has status "invalid_input" and mentions the missing fields
    for i, (validation_result, missing_fields) in enumerate(zip(result.results, expected_missing)):
        assert validation_result.status == "invalid_input", (
            f"Row {i}: Expected status 'invalid_input', got '{validation_result.status}'. "
            f"Missing fields: {missing_fields}"
        )
        assert validation_result.error_message is not None, (
            f"Row {i}: error_message should not be None when fields are missing"
        )
        # Each missing field name should appear in the error message
        for field in missing_fields:
            assert field in validation_result.error_message, (
                f"Row {i}: error_message '{validation_result.error_message}' "
                f"does not mention missing field '{field}'"
            )
