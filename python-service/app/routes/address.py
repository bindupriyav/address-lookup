"""Route for single address validation endpoint.

Exposes POST /validate/address which accepts a StructuredAddress,
validates required fields, and delegates to AddressValidator.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.adapters.usps_adapter import USPSAdapterInterface, get_usps_adapter
from app.models.address import StructuredAddress
from app.models.validation import ValidationResult
from app.services.address_validator import AddressValidator

router = APIRouter()

# Required fields that must be non-empty for a valid address request
_REQUIRED_FIELDS = ["street_line_1", "city", "state", "zipcode"]


def _get_address_validator(
    adapter: USPSAdapterInterface = Depends(get_usps_adapter),
) -> AddressValidator:
    """Dependency that provides an AddressValidator wired with the USPS adapter."""
    return AddressValidator(usps_adapter=adapter)


def _get_missing_fields(address: StructuredAddress) -> List[str]:
    """Return list of required fields that are empty strings."""
    missing = []
    for field in _REQUIRED_FIELDS:
        value = getattr(address, field)
        if not value or value.strip() == "":
            missing.append(field)
    return missing


@router.post("/validate/address", response_model=ValidationResult)
async def validate_address(
    address: StructuredAddress,
    validator: AddressValidator = Depends(_get_address_validator),
) -> ValidationResult:
    """Validate a single structured address via USPS.

    Accepts a StructuredAddress in the request body. If any required fields
    (street_line_1, city, state, zipcode) are missing or empty, returns a
    400 error with the MISSING_FIELDS error code listing the missing fields.

    On success, delegates to AddressValidator.validate() and returns the
    ValidationResult.
    """
    missing = _get_missing_fields(address)
    if missing:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "MISSING_FIELDS",
                "message": f"Missing required fields: {', '.join(missing)}",
                "fields": missing,
            },
        )

    return await validator.validate(address)
