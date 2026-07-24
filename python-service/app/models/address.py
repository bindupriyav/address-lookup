"""Pydantic models for address data structures."""

from typing import Optional

from pydantic import BaseModel


class StructuredAddress(BaseModel):
    """A structured US address with discrete fields."""

    street_line_1: str
    street_line_2: Optional[str] = None
    city: str
    state: str
    zipcode: str

    def to_string(self) -> str:
        """Serialize the address to a pipe-delimited string for round-trip support.

        Format: "street_line_1|street_line_2|city|state|zipcode"
        When street_line_2 is None, it is serialized as an empty string.
        """
        line_2 = self.street_line_2 if self.street_line_2 is not None else ""
        return f"{self.street_line_1}|{line_2}|{self.city}|{self.state}|{self.zipcode}"

    @classmethod
    def from_string(cls, value: str) -> "StructuredAddress":
        """Parse a pipe-delimited string back into a StructuredAddress.

        Expected format: "street_line_1|street_line_2|city|state|zipcode"
        An empty street_line_2 segment is interpreted as None.

        Raises:
            ValueError: If the string does not contain exactly 5 pipe-delimited segments.
        """
        parts = value.split("|")
        if len(parts) != 5:
            raise ValueError(
                f"Expected 5 pipe-delimited segments, got {len(parts)}: {value!r}"
            )
        street_line_1, street_line_2_raw, city, state, zipcode = parts
        street_line_2 = street_line_2_raw if street_line_2_raw != "" else None
        return cls(
            street_line_1=street_line_1,
            street_line_2=street_line_2,
            city=city,
            state=state,
            zipcode=zipcode,
        )
