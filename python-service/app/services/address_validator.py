"""Address Validator service with core validation logic.

Provides the AddressValidator class that delegates address validation
and zipcode-city verification to the USPS adapter, and offers simple
string normalization methods.
"""

from typing import List

from app.adapters.usps_adapter import USPSAdapterInterface
from app.models.address import StructuredAddress
from app.models.validation import ValidationResult, ZipcodeCityResult

# Required fields that must be non-empty for a valid address
_REQUIRED_FIELDS = ["street_line_1", "city", "state", "zipcode"]


class AddressValidator:
    """Core address validation service.

    Delegates structured address validation and zipcode-city verification
    to the injected USPS adapter. Also provides simple string normalization
    helpers (check_address, verify_address).
    """

    def __init__(self, usps_adapter: USPSAdapterInterface):
        self.usps_adapter = usps_adapter

    def _get_missing_fields(self, address: StructuredAddress) -> List[str]:
        """Check for missing or empty required fields.

        Args:
            address: A StructuredAddress to check.

        Returns:
            A list of field names that are empty strings.
        """
        missing = []
        for field in _REQUIRED_FIELDS:
            value = getattr(address, field)
            if value == "":
                missing.append(field)
        return missing

    async def validate(self, address: StructuredAddress) -> ValidationResult:
        """Validate a structured address via USPS.

        Checks for missing/empty required fields before delegating to the
        USPS adapter. If any required fields are empty, returns a
        ValidationResult with status "invalid_input".

        Args:
            address: A StructuredAddress to validate.

        Returns:
            A ValidationResult with standardized address and status.
        """
        missing_fields = self._get_missing_fields(address)
        if missing_fields:
            return ValidationResult(
                original_address=address,
                standardized_address=None,
                status="invalid_input",
                error_message=f"Missing required fields: {', '.join(missing_fields)}",
            )
        return await self.usps_adapter.validate_address(address)

    async def verify_zipcode_city(self, zipcode: str, city: str) -> ZipcodeCityResult:
        """Verify zipcode-city match via USPS.

        Args:
            zipcode: A 5-digit or 5+4 format zipcode.
            city: The city name to verify against the zipcode.

        Returns:
            A ZipcodeCityResult indicating match or mismatch.
        """
        return await self.usps_adapter.verify_zipcode_city(zipcode, city)

    def check_address(self, address: str) -> str:
        """Normalize address to uppercase.

        Args:
            address: Address input as string.

        Returns:
            The address converted to uppercase.
        """
        return address.upper()

    def verify_address(self, address: str) -> str:
        """Normalize address to uppercase (identical to check_address).

        Args:
            address: Address input as string.

        Returns:
            The address converted to uppercase.
        """
        return address.upper()
