"""USPS Adapter interface and factory function.

Defines the abstract interface for USPS address validation and provides
a factory that selects the appropriate implementation based on the
USPS_API_KEY environment variable.
"""

import os
from abc import ABC, abstractmethod

from app.models.address import StructuredAddress
from app.models.validation import ValidationResult, ZipcodeCityResult


class USPSAdapterInterface(ABC):
    """Abstract base class for USPS address validation adapters."""

    @abstractmethod
    async def validate_address(self, address: StructuredAddress) -> ValidationResult:
        """Validate a structured address against USPS.

        Args:
            address: A structured address with all required fields.

        Returns:
            A ValidationResult with the standardized address and status.
        """
        ...

    @abstractmethod
    async def verify_zipcode_city(self, zipcode: str, city: str) -> ZipcodeCityResult:
        """Verify that a city matches a given zipcode.

        Args:
            zipcode: A 5-digit or 5+4 format zipcode.
            city: The city name to verify against the zipcode.

        Returns:
            A ZipcodeCityResult indicating match or mismatch.
        """
        ...


def get_usps_adapter() -> USPSAdapterInterface:
    """Factory function that returns the appropriate USPS adapter implementation.

    Returns MockUSPSAdapter when USPS_API_KEY is "mock" or unset.
    Returns RealUSPSAdapter when USPS_API_KEY is set to a real API key value.

    Returns:
        An instance of USPSAdapterInterface.
    """
    api_key = os.environ.get("USPS_API_KEY", "mock")
    if api_key == "mock" or not api_key:
        from app.adapters.mock_usps import MockUSPSAdapter

        return MockUSPSAdapter()

    from app.adapters.real_usps import RealUSPSAdapter

    return RealUSPSAdapter(api_key=api_key)
