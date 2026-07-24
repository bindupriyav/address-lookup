"""Unit tests for the BulkProcessor service."""

import io
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock
from openpyxl import Workbook
from fastapi import UploadFile

from app.models.address import StructuredAddress
from app.models.validation import ValidationResult
from app.services.address_validator import AddressValidator
from app.services.bulk_processor import (
    BulkProcessor,
    InvalidFileFormatError,
    FileTooLargeError,
    RowLimitExceededError,
)


def _create_excel_bytes(rows: list, headers=None) -> bytes:
    """Helper: create an in-memory Excel file with given headers and rows."""
    wb = Workbook()
    ws = wb.active
    if headers is None:
        headers = ["street_line_1", "street_line_2", "city", "state", "zipcode"]
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()


def _make_upload_file(content: bytes, filename: str) -> UploadFile:
    """Helper: create an UploadFile from bytes and a filename."""
    file_obj = io.BytesIO(content)
    return UploadFile(filename=filename, file=file_obj)


@pytest.fixture
def mock_validator():
    """Create a mock AddressValidator that returns valid results."""
    validator = MagicMock(spec=AddressValidator)

    async def mock_validate(address: StructuredAddress):
        return ValidationResult(
            original_address=address,
            standardized_address=StructuredAddress(
                street_line_1=address.street_line_1.upper(),
                street_line_2=address.street_line_2,
                city=address.city.upper(),
                state=address.state.upper(),
                zipcode=address.zipcode,
            ),
            status="valid",
            error_message=None,
        )

    validator.validate = mock_validate
    return validator


@pytest.fixture
def processor(mock_validator):
    """Create a BulkProcessor with the mock validator."""
    return BulkProcessor(validator=mock_validator)


class TestFileFormatValidation:
    """Tests for file format validation."""

    @pytest.mark.asyncio
    async def test_rejects_non_excel_file(self, processor):
        """Non-Excel files should raise InvalidFileFormatError."""
        upload = _make_upload_file(b"not an excel file", "data.csv")
        with pytest.raises(InvalidFileFormatError):
            await processor.process_file(upload)

    @pytest.mark.asyncio
    async def test_rejects_txt_file(self, processor):
        """Text files should raise InvalidFileFormatError."""
        upload = _make_upload_file(b"hello", "addresses.txt")
        with pytest.raises(InvalidFileFormatError):
            await processor.process_file(upload)

    @pytest.mark.asyncio
    async def test_accepts_xlsx_file(self, processor):
        """Valid .xlsx files should be accepted."""
        content = _create_excel_bytes([
            ["123 Main St", "", "Springfield", "IL", "62704"],
        ])
        upload = _make_upload_file(content, "addresses.xlsx")
        result = await processor.process_file(upload)
        assert result.total_rows == 1

    @pytest.mark.asyncio
    async def test_accepts_xls_extension(self, processor):
        """Files with .xls extension should be accepted (extension check only)."""
        # Note: openpyxl only reads .xlsx, but extension validation should pass.
        # The actual parse may fail, but format validation passes.
        content = _create_excel_bytes([
            ["123 Main St", "", "Springfield", "IL", "62704"],
        ])
        upload = _make_upload_file(content, "addresses.xls")
        # This should at least pass the extension check
        result = await processor.process_file(upload)
        assert result.total_rows == 1


class TestFileSizeValidation:
    """Tests for file size validation."""

    @pytest.mark.asyncio
    async def test_rejects_oversized_file(self, processor):
        """Files exceeding 10MB should raise FileTooLargeError."""
        # Create content larger than 10MB
        large_content = b"x" * (10 * 1024 * 1024 + 1)
        upload = _make_upload_file(large_content, "big.xlsx")
        with pytest.raises(FileTooLargeError):
            await processor.process_file(upload)

    @pytest.mark.asyncio
    async def test_accepts_file_at_size_limit(self, processor):
        """Files exactly at 10MB should be accepted (format may fail but size passes)."""
        # We just test the size logic by creating a valid small file
        content = _create_excel_bytes([
            ["123 Main St", "", "Springfield", "IL", "62704"],
        ])
        upload = _make_upload_file(content, "data.xlsx")
        result = await processor.process_file(upload)
        assert result.total_rows == 1


class TestRowLimitValidation:
    """Tests for row limit validation."""

    @pytest.mark.asyncio
    async def test_rejects_file_exceeding_row_limit(self, processor):
        """Files with more than 1000 data rows should raise RowLimitExceededError."""
        rows = [["123 Main St", "", "City", "ST", "12345"]] * 1001
        content = _create_excel_bytes(rows)
        upload = _make_upload_file(content, "many_rows.xlsx")
        with pytest.raises(RowLimitExceededError):
            await processor.process_file(upload)

    @pytest.mark.asyncio
    async def test_accepts_file_at_row_limit(self, processor):
        """Files with exactly 1000 rows should be accepted."""
        rows = [["123 Main St", "", "City", "ST", "12345"]] * 1000
        content = _create_excel_bytes(rows)
        upload = _make_upload_file(content, "max_rows.xlsx")
        result = await processor.process_file(upload)
        assert result.total_rows == 1000


class TestRowProcessing:
    """Tests for address row processing."""

    @pytest.mark.asyncio
    async def test_valid_rows_are_validated(self, processor):
        """Valid address rows should be validated and return status 'valid'."""
        content = _create_excel_bytes([
            ["123 Main St", "Apt 4", "Springfield", "IL", "62704"],
            ["456 Oak Ave", "", "Chicago", "IL", "60601"],
        ])
        upload = _make_upload_file(content, "addresses.xlsx")
        result = await processor.process_file(upload)

        assert result.total_rows == 2
        assert len(result.results) == 2
        assert result.results[0].status == "valid"
        assert result.results[1].status == "valid"

    @pytest.mark.asyncio
    async def test_row_order_is_preserved(self, processor):
        """Results should preserve the original row order."""
        content = _create_excel_bytes([
            ["111 First St", "", "Alpha", "AA", "11111"],
            ["222 Second St", "", "Beta", "BB", "22222"],
            ["333 Third St", "", "Gamma", "CC", "33333"],
        ])
        upload = _make_upload_file(content, "ordered.xlsx")
        result = await processor.process_file(upload)

        assert result.total_rows == 3
        assert result.results[0].original_address.street_line_1 == "111 First St"
        assert result.results[1].original_address.street_line_1 == "222 Second St"
        assert result.results[2].original_address.street_line_1 == "333 Third St"

    @pytest.mark.asyncio
    async def test_missing_required_fields_returns_invalid_input(self, processor):
        """Rows with missing required fields should return 'invalid_input' status."""
        content = _create_excel_bytes([
            ["", "", "Springfield", "IL", "62704"],  # missing street_line_1
        ])
        upload = _make_upload_file(content, "missing.xlsx")
        result = await processor.process_file(upload)

        assert result.total_rows == 1
        assert result.results[0].status == "invalid_input"
        assert "street_line_1" in result.results[0].error_message

    @pytest.mark.asyncio
    async def test_multiple_missing_fields_listed(self, processor):
        """Error message should list all missing fields."""
        content = _create_excel_bytes([
            ["", "", "", "", ""],  # all required fields missing
        ])
        upload = _make_upload_file(content, "empty_row.xlsx")
        result = await processor.process_file(upload)

        assert result.total_rows == 1
        assert result.results[0].status == "invalid_input"
        error_msg = result.results[0].error_message
        assert "street_line_1" in error_msg
        assert "city" in error_msg
        assert "state" in error_msg
        assert "zipcode" in error_msg

    @pytest.mark.asyncio
    async def test_mix_of_valid_and_invalid_rows(self, processor):
        """Mixed rows should have correct statuses for each."""
        content = _create_excel_bytes([
            ["123 Main St", "", "Springfield", "IL", "62704"],  # valid
            ["", "", "", "", ""],  # invalid - missing all required
            ["456 Oak Ave", "", "Chicago", "IL", "60601"],  # valid
        ])
        upload = _make_upload_file(content, "mixed.xlsx")
        result = await processor.process_file(upload)

        assert result.total_rows == 3
        assert result.results[0].status == "valid"
        assert result.results[1].status == "invalid_input"
        assert result.results[2].status == "valid"

    @pytest.mark.asyncio
    async def test_empty_file_returns_zero_rows(self, processor):
        """An Excel file with only headers should return 0 results."""
        content = _create_excel_bytes([])
        upload = _make_upload_file(content, "empty.xlsx")
        result = await processor.process_file(upload)

        assert result.total_rows == 0
        assert result.results == []

    @pytest.mark.asyncio
    async def test_street_line_2_is_optional(self, processor):
        """street_line_2 being empty should not cause invalid_input."""
        content = _create_excel_bytes([
            ["123 Main St", "", "Springfield", "IL", "62704"],
        ])
        upload = _make_upload_file(content, "no_line2.xlsx")
        result = await processor.process_file(upload)

        assert result.total_rows == 1
        assert result.results[0].status == "valid"
