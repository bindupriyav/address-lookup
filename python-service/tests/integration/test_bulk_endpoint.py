"""Integration tests for POST /api/v1/validate/bulk endpoint."""

import io

import pytest
from openpyxl import Workbook
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _create_excel_file(rows: list[dict], include_header: bool = True) -> bytes:
    """Helper to create an in-memory Excel file from row dictionaries."""
    wb = Workbook()
    ws = wb.active
    headers = ["street_line_1", "street_line_2", "city", "state", "zipcode"]
    if include_header:
        ws.append(headers)
    for row in rows:
        ws.append([row.get(h, "") for h in headers])
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


class TestBulkValidationEndpoint:
    """Tests for the bulk address validation endpoint."""

    def test_valid_excel_returns_200(self):
        """A valid Excel file with addresses should return 200 with results."""
        rows = [
            {
                "street_line_1": "1600 Pennsylvania Ave",
                "street_line_2": "",
                "city": "Washington",
                "state": "DC",
                "zipcode": "20500",
            }
        ]
        content = _create_excel_file(rows)
        resp = client.post(
            "/api/v1/validate/bulk",
            files={"file": ("addresses.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_rows"] == 1
        assert len(data["results"]) == 1
        assert data["results"][0]["original_address"]["street_line_1"] == "1600 Pennsylvania Ave"

    def test_invalid_file_format_returns_400(self):
        """A non-Excel file should return 400 with INVALID_FILE_FORMAT."""
        resp = client.post(
            "/api/v1/validate/bulk",
            files={"file": ("data.csv", b"col1,col2\nval1,val2", "text/csv")},
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert detail["error_code"] == "INVALID_FILE_FORMAT"

    def test_file_too_large_returns_400(self):
        """A file exceeding 10MB should return 400 with FILE_TOO_LARGE."""
        # Create a valid xlsx but pad it to exceed 10MB
        large_content = b"x" * (10 * 1024 * 1024 + 1)
        resp = client.post(
            "/api/v1/validate/bulk",
            files={"file": ("big.xlsx", large_content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert detail["error_code"] in ("FILE_TOO_LARGE", "INVALID_FILE_FORMAT")

    def test_row_limit_exceeded_returns_400(self):
        """A file with more than 1000 rows should return 400 with ROW_LIMIT_EXCEEDED."""
        rows = [
            {"street_line_1": f"{i} Main St", "city": "City", "state": "NY", "zipcode": "10001"}
            for i in range(1001)
        ]
        content = _create_excel_file(rows)
        resp = client.post(
            "/api/v1/validate/bulk",
            files={"file": ("many.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert detail["error_code"] == "ROW_LIMIT_EXCEEDED"

    def test_missing_fields_row_gets_invalid_input_status(self):
        """A row missing required fields should get status invalid_input."""
        rows = [
            {"street_line_1": "", "city": "Washington", "state": "DC", "zipcode": "20500"}
        ]
        content = _create_excel_file(rows)
        resp = client.post(
            "/api/v1/validate/bulk",
            files={"file": ("addresses.xlsx", content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["results"][0]["status"] == "invalid_input"
        assert "street_line_1" in data["results"][0]["error_message"]

    def test_error_response_structure(self):
        """Error responses should follow the standard structure with error_code, message, fields."""
        resp = client.post(
            "/api/v1/validate/bulk",
            files={"file": ("data.txt", b"not excel", "text/plain")},
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert "error_code" in detail
        assert "message" in detail
        assert "fields" in detail
