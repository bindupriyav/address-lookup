"""Mock USPS adapter for development and testing.

This module provides a mock implementation of the USPS adapter interface
that returns deterministic responses without calling the real USPS API.
"""

from app.adapters.usps_adapter import USPSAdapterInterface
from app.models.address import StructuredAddress
from app.models.validation import ValidationResult, ZipcodeCityResult

# Known test addresses that return deterministic standardized responses
_KNOWN_ADDRESSES = {
    "1600 PENNSYLVANIA AVE NW": StructuredAddress(
        street_line_1="1600 PENNSYLVANIA AVE NW",
        street_line_2=None,
        city="WASHINGTON",
        state="DC",
        zipcode="20500",
    ),
}


class MockUSPSAdapter(USPSAdapterInterface):
    """Mock USPS adapter that returns deterministic responses."""

    async def validate_address(self, address: StructuredAddress) -> ValidationResult:
        """Validate a structured address using mock logic.

        Returns invalid status when street_line_1 contains the substring "INVALID".
        Returns a deterministic standardized address for known test addresses.
        Returns valid with uppercased standardized address for all other inputs.
        """
        # Check for "INVALID" substring in street_line_1 (case-sensitive on the keyword)
        if "INVALID" in address.street_line_1:
            return ValidationResult(
                original_address=address,
                standardized_address=None,
                status="invalid",
                error_message="Address not found in USPS database",
            )

        # Check for known test addresses (match on uppercased street_line_1)
        known = _KNOWN_ADDRESSES.get(address.street_line_1.upper())
        if known:
            return ValidationResult(
                original_address=address,
                standardized_address=known,
                status="valid",
            )

        # Default: return valid with uppercased standardized address
        standardized = StructuredAddress(
            street_line_1=address.street_line_1.upper(),
            street_line_2=address.street_line_2.upper() if address.street_line_2 else None,
            city=address.city.upper(),
            state=address.state.upper(),
            zipcode=address.zipcode,
        )
        return ValidationResult(
            original_address=address,
            standardized_address=standardized,
            status="valid",
        )

    async def verify_zipcode_city(self, zipcode: str, city: str) -> ZipcodeCityResult:
        """Verify that a city matches a given zipcode using mock data.

        Returns match for known pairs, mismatch with valid_cities otherwise.
        """
        # Known zipcode-city pairs for mock testing
        known_pairs = {
            "20500": ["WASHINGTON"],
            "10001": ["NEW YORK"],
            "90210": ["BEVERLY HILLS"],
            "60601": ["CHICAGO"],
        }

        zip5 = zipcode[:5]
        valid_cities = known_pairs.get(zip5)

        if valid_cities and city.upper() in valid_cities:
            return ZipcodeCityResult(
                zipcode=zipcode,
                city=city.upper(),
                status="match",
            )

        return ZipcodeCityResult(
            zipcode=zipcode,
            city=city,
            status="mismatch",
            valid_cities=valid_cities or ["UNKNOWN"],
        )
