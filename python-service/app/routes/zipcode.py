"""Route for zipcode-city verification endpoint.

Exposes POST /validate/zipcode-city which accepts a zipcode and city,
validates the zipcode format, and delegates to AddressValidator.
"""

import re

from fastapi import APIRouter, Depends, HTTPException

from app.adapters.usps_adapter import USPSAdapterInterface, get_usps_adapter
from app.models.validation import ZipcodeCityRequest, ZipcodeCityResult
from app.services.address_validator import AddressValidator

router = APIRouter()

# Regex pattern for valid zipcode: exactly 5 digits, or 5 digits + hyphen + 4 digits
_ZIPCODE_PATTERN = re.compile(r"^\d{5}(-\d{4})?$")


def _get_address_validator(
    adapter: USPSAdapterInterface = Depends(get_usps_adapter),
) -> AddressValidator:
    """Dependency that provides an AddressValidator wired with the USPS adapter."""
    return AddressValidator(usps_adapter=adapter)


@router.post("/validate/zipcode-city", response_model=ZipcodeCityResult)
async def verify_zipcode_city(
    request: ZipcodeCityRequest,
    validator: AddressValidator = Depends(_get_address_validator),
) -> ZipcodeCityResult:
    """Verify that a zipcode matches a given city via USPS.

    Accepts a ZipcodeCityRequest (zipcode, city) in the request body.
    Validates that the zipcode is in 5-digit or 5+4 format. If invalid,
    returns a 400 error with the INVALID_ZIPCODE_FORMAT error code.

    On success, delegates to AddressValidator.verify_zipcode_city() and
    returns the ZipcodeCityResult.
    """
    if not _ZIPCODE_PATTERN.match(request.zipcode):
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "INVALID_ZIPCODE_FORMAT",
                "message": "Zipcode must be 5 digits or 5+4 format",
            },
        )

    return await validator.verify_zipcode_city(request.zipcode, request.city)
