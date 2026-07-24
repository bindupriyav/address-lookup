"""LLM-powered address parser that extracts structured address fields from raw text."""

import asyncio
import json
from typing import Any, Dict

import httpx

from app.models.address import StructuredAddress


class LLMTimeoutError(Exception):
    """Raised when the LLM service does not respond within the configured timeout."""

    def __init__(self, timeout: float):
        self.timeout = timeout
        super().__init__(
            f"LLM service did not respond within {timeout} seconds"
        )


class LLMParseError(Exception):
    """Raised when the LLM response cannot be parsed into a valid StructuredAddress."""

    def __init__(self, raw_text: str, reason: str = ""):
        self.raw_text = raw_text
        self.reason = reason
        message = f"Failed to parse address from text: {raw_text!r}"
        if reason:
            message += f" — {reason}"
        super().__init__(message)


class LLMParser:
    """Parses unstructured address text into structured fields using an LLM service."""

    def __init__(self, endpoint_url: str = "", api_key: str = ""):
        self.endpoint_url = endpoint_url
        self.api_key = api_key

    async def parse(self, raw_text: str, timeout: float = 10.0) -> StructuredAddress:
        """Parse unstructured address text into structured fields using LLM.

        Args:
            raw_text: The raw, unstructured address text to parse.
            timeout: Maximum seconds to wait for the LLM service response.
                     Defaults to 10.0 seconds.

        Returns:
            A StructuredAddress extracted from the raw text.

        Raises:
            LLMTimeoutError: If the LLM service doesn't respond within timeout.
            LLMParseError: If the LLM response cannot be converted to a valid
                           StructuredAddress.
        """
        try:
            response = await asyncio.wait_for(
                self._call_llm_service(raw_text),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            raise LLMTimeoutError(timeout=timeout)
        except httpx.TimeoutException:
            raise LLMTimeoutError(timeout=timeout)

        return self._extract_address(response, raw_text)

    async def _call_llm_service(self, raw_text: str) -> Dict[str, Any]:
        """Make the actual HTTP call to the LLM service.

        This method contains the real HTTP integration point. In production,
        it sends the raw text to the configured LLM endpoint and returns the
        parsed JSON response.

        Args:
            raw_text: The raw address text to send to the LLM.

        Returns:
            The JSON response from the LLM service as a dictionary.

        Raises:
            NotImplementedError: When no endpoint URL is configured (development mode).
            httpx.TimeoutException: When the HTTP request times out.
            LLMParseError: When the service returns an error or non-JSON response.
        """
        if not self.endpoint_url:
            raise NotImplementedError(
                "LLM service endpoint not configured. "
                "Set endpoint_url to enable LLM-powered parsing."
            )

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        payload = {
            "prompt": self._build_prompt(raw_text),
            "raw_text": raw_text,
        }

        async with httpx.AsyncClient() as client:
            http_response = await client.post(
                self.endpoint_url,
                json=payload,
                headers=headers,
                timeout=None,  # Timeout is managed by asyncio.wait_for
            )

        if http_response.status_code != 200:
            raise LLMParseError(
                raw_text=raw_text,
                reason=f"LLM service returned status {http_response.status_code}",
            )

        try:
            return http_response.json()
        except (json.JSONDecodeError, ValueError):
            raise LLMParseError(
                raw_text=raw_text,
                reason="LLM service returned non-JSON response",
            )

    def _build_prompt(self, raw_text: str) -> str:
        """Build the prompt to send to the LLM for address extraction.

        Args:
            raw_text: The raw address text.

        Returns:
            A formatted prompt string.
        """
        return (
            "Extract the US address components from the following text. "
            "Return a JSON object with these exact keys: "
            "street_line_1, street_line_2, city, state, zipcode. "
            "If street_line_2 is not present, set it to null.\n\n"
            f"Text: {raw_text}"
        )

    def _extract_address(
        self, response: Dict[str, Any], raw_text: str
    ) -> StructuredAddress:
        """Extract a StructuredAddress from the LLM response.

        Args:
            response: The parsed JSON response from the LLM service.
            raw_text: The original raw text (for error reporting).

        Returns:
            A validated StructuredAddress.

        Raises:
            LLMParseError: If the response doesn't contain valid address fields.
        """
        # The LLM response may contain the address fields directly or nested
        address_data = response.get("address", response)

        required_fields = ["street_line_1", "city", "state", "zipcode"]
        missing_fields = [
            field for field in required_fields if not address_data.get(field)
        ]

        if missing_fields:
            raise LLMParseError(
                raw_text=raw_text,
                reason=f"Missing required fields: {', '.join(missing_fields)}",
            )

        try:
            return StructuredAddress(
                street_line_1=address_data["street_line_1"],
                street_line_2=address_data.get("street_line_2"),
                city=address_data["city"],
                state=address_data["state"],
                zipcode=address_data["zipcode"],
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise LLMParseError(
                raw_text=raw_text,
                reason=f"Invalid address data in LLM response: {exc}",
            )
