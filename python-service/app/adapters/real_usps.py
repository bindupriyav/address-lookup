"""Real USPS adapter for production use.

This module provides the real implementation of the USPS adapter interface
that communicates with the USPS Address API.

It uses httpx for async HTTP calls with a 30-second timeout and 1 retry
with exponential backoff (1s base) on failure.
"""

import asyncio
from typing import Any, Dict

import httpx

from app.adapters.usps_adapter import USPSAdapterInterface
from app.models.address import StructuredAddress
from app.models.validation import ValidationResult, ZipcodeCityResult

# USPS API base URLs
USPS_ADDRESS_URL = "https://api.usps.com/addresses/v3/address"
USPS_CITY_STATE_URL = "https://api.usps.com/addresses/v3/city-state"

# Timeout and retry configuration
REQUEST_TIMEOUT = 30.0  # seconds
MAX_RETRIES = 1
BACKOFF_BASE = 1.0  # seconds


class USPSServiceError(Exception):
    """Raised when the USPS API returns an error or is unreachable."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class RealUSPSAdapter(USPSAdapterInterface):
    """Real USPS adapter that communicates with the USPS Address API."""

    def __init__(self, api_key: str):
        """Initialize with USPS API key.

        Args:
            api_key: The USPS API key for authentication.
        """
        self.api_key = api_key
        self._timeout = httpx.Timeout(REQUEST_TIMEOUT)

    def _get_headers(self) -> Dict[str, str]:
        """Build request headers with authorization."""
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def _request_with_retry(
        self, method: str, url: str, **kwargs: Any
    ) -> httpx.Response:
        """Make an HTTP request with retry logic.

        Implements 1 retry with exponential backoff (1s base) on failure.

        Args:
            method: HTTP method (GET, POST, etc.)
            url: The request URL.
            **kwargs: Additional arguments passed to httpx request.

        Returns:
            The httpx Response object.

        Raises:
            USPSServiceError: When the request fails after all retries.
        """
        last_exception: Exception | None = None

        for attempt in range(MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(
                    timeout=self._timeout
                ) as client:
                    response = await client.request(
                        method, url, headers=self._get_headers(), **kwargs
                    )
                    response.raise_for_status()
                    return response
            except httpx.HTTPStatusError as exc:
                last_exception = exc
                if attempt < MAX_RETRIES:
                    backoff = BACKOFF_BASE * (2**attempt)
                    await asyncio.sleep(backoff)
                    continue
                raise USPSServiceError(
                    f"USPS API returned HTTP {exc.response.status_code}: "
                    f"{exc.response.text}",
                    status_code=exc.response.status_code,
                ) from exc
            except httpx.TimeoutException as exc:
                last_exception = exc
                if attempt < MAX_RETRIES:
                    backoff = BACKOFF_BASE * (2**attempt)
                    await asyncio.sleep(backoff)
                    continue
                raise USPSServiceError(
                    "USPS API request timed out after retries"
                ) from exc
            except httpx.RequestError as exc:
                last_exception = exc
                if attempt < MAX_RETRIES:
                    backoff = BACKOFF_BASE * (2**attempt)
                    await asyncio.sleep(backoff)
                    continue
                raise USPSServiceError(
                    f"USPS API request failed: {str(exc)}"
                ) from exc

        # Should not reach here, but just in case
        raise USPSServiceError(
            f"USPS API request failed after {MAX_RETRIES + 1} attempts"
        ) from last_exception

    async def validate_address(self, address: StructuredAddress) -> ValidationResult:
        """Validate a structured address against the real USPS API.

        Args:
            address: A structured address with all required fields.

        Returns:
            A ValidationResult with the standardized address and status.

        Raises:
            USPSServiceError: When the USPS API is unreachable or returns an error.
        """
        params = {
            "streetAddress": address.street_line_1,
            "city": address.city,
            "state": address.state,
            "ZIPCode": address.zipcode,
        }
        if address.street_line_2:
            params["secondaryAddress"] = address.street_line_2

        try:
            response = await self._request_with_retry(
                "GET", USPS_ADDRESS_URL, params=params
            )
            data = response.json()
            return self._parse_address_response(data, address)
        except USPSServiceError:
            raise
        except Exception as exc:
            raise USPSServiceError(
                f"Failed to parse USPS address validation response: {str(exc)}"
            ) from exc

    async def verify_zipcode_city(self, zipcode: str, city: str) -> ZipcodeCityResult:
        """Verify that a city matches a given zipcode via the real USPS API.

        Args:
            zipcode: A 5-digit or 5+4 format zipcode.
            city: The city name to verify against the zipcode.

        Returns:
            A ZipcodeCityResult indicating match or mismatch.

        Raises:
            USPSServiceError: When the USPS API is unreachable or returns an error.
        """
        params = {"ZIPCode": zipcode}

        try:
            response = await self._request_with_retry(
                "GET", USPS_CITY_STATE_URL, params=params
            )
            data = response.json()
            return self._parse_city_state_response(data, zipcode, city)
        except USPSServiceError:
            raise
        except Exception as exc:
            raise USPSServiceError(
                f"Failed to parse USPS city-state response: {str(exc)}"
            ) from exc

    def _parse_address_response(
        self, data: Dict[str, Any], original_address: StructuredAddress
    ) -> ValidationResult:
        """Parse the USPS address validation API response.

        Args:
            data: The JSON response from the USPS API.
            original_address: The original address that was validated.

        Returns:
            A ValidationResult with standardized address if valid.
        """
        # USPS API returns address object with standardized fields
        address_data = data.get("address", {})

        if not address_data:
            return ValidationResult(
                original_address=original_address,
                standardized_address=None,
                status="invalid",
                error_message="USPS could not validate this address",
            )

        standardized = StructuredAddress(
            street_line_1=address_data.get("streetAddress", ""),
            street_line_2=address_data.get("secondaryAddress") or None,
            city=address_data.get("city", ""),
            state=address_data.get("state", ""),
            zipcode=address_data.get("ZIPCode", ""),
        )

        return ValidationResult(
            original_address=original_address,
            standardized_address=standardized,
            status="valid",
        )

    def _parse_city_state_response(
        self, data: Dict[str, Any], zipcode: str, city: str
    ) -> ZipcodeCityResult:
        """Parse the USPS city-state API response.

        Args:
            data: The JSON response from the USPS API.
            zipcode: The zipcode that was queried.
            city: The city to verify against.

        Returns:
            A ZipcodeCityResult indicating match or mismatch.
        """
        city_state = data.get("city-state", data)
        valid_city = city_state.get("city", "")
        valid_cities_list = city_state.get("validCities", [])

        # If validCities is not in the response, use the single city
        if not valid_cities_list and valid_city:
            valid_cities_list = [valid_city]

        # Check if the provided city matches any valid city (case-insensitive)
        city_upper = city.upper()
        is_match = any(vc.upper() == city_upper for vc in valid_cities_list)

        if is_match:
            return ZipcodeCityResult(
                zipcode=zipcode,
                city=city,
                status="match",
            )
        else:
            return ZipcodeCityResult(
                zipcode=zipcode,
                city=city,
                status="mismatch",
                valid_cities=valid_cities_list if valid_cities_list else None,
            )
