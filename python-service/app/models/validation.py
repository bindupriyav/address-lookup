"""Pydantic models for validation results and request payloads."""

from typing import List, Literal, Optional

from pydantic import BaseModel

from app.models.address import StructuredAddress


class ValidationResult(BaseModel):
    """Result of validating a single address against USPS."""

    original_address: StructuredAddress
    standardized_address: Optional[StructuredAddress] = None
    status: Literal["valid", "invalid", "invalid_input", "parse_failed"]
    error_message: Optional[str] = None


class ZipcodeCityResult(BaseModel):
    """Result of verifying a zipcode-city match."""

    zipcode: str
    city: str
    status: Literal["match", "mismatch"]
    valid_cities: Optional[List[str]] = None


class ZipcodeCityRequest(BaseModel):
    """Request payload for zipcode-city verification."""

    zipcode: str  # 5-digit or 5+4 format (e.g., "20500" or "20500-0001")
    city: str


class ParseRequest(BaseModel):
    """Request payload for LLM-powered address parsing."""

    raw_address: str


class ParseValidationResult(BaseModel):
    """Result of parsing unstructured text and validating the extracted address."""

    raw_text: str
    parsed_address: Optional[StructuredAddress] = None
    validation_result: Optional[ValidationResult] = None
    status: Literal["valid", "invalid", "parse_failed", "service_unavailable"]
    error_message: Optional[str] = None


class BulkValidationResult(BaseModel):
    """Result of bulk address validation from an Excel file upload."""

    total_rows: int
    results: List[ValidationResult]  # Preserves row order
