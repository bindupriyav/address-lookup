"""Route for LLM-powered address parsing and validation endpoint.

Exposes POST /validate/parse which accepts raw unstructured address text,
parses it via the LLM parser into structured fields, then validates the
parsed address via USPS.
"""

from fastapi import APIRouter, Depends

from app.adapters.usps_adapter import USPSAdapterInterface, get_usps_adapter
from app.models.validation import ParseRequest, ParseValidationResult
from app.parsers.llm_parser import LLMParser, LLMParseError, LLMTimeoutError
from app.services.address_validator import AddressValidator

router = APIRouter()


def _get_address_validator(
    adapter: USPSAdapterInterface = Depends(get_usps_adapter),
) -> AddressValidator:
    """Dependency that provides an AddressValidator wired with the USPS adapter."""
    return AddressValidator(usps_adapter=adapter)


def _get_llm_parser() -> LLMParser:
    """Dependency that provides an LLMParser instance."""
    return LLMParser()


@router.post("/validate/parse", response_model=ParseValidationResult)
async def parse_and_validate(
    request: ParseRequest,
    validator: AddressValidator = Depends(_get_address_validator),
    parser: LLMParser = Depends(_get_llm_parser),
) -> ParseValidationResult:
    """Parse unstructured address text via LLM and validate via USPS.

    Accepts a ParseRequest with a raw_address string. The LLM parser attempts
    to extract structured address fields from the text. If successful, the
    parsed address is validated against USPS.

    Error scenarios return HTTP 200 with an appropriate status in the body:
    - LLMTimeoutError → status "service_unavailable"
    - LLMParseError → status "parse_failed"
    """
    raw_text = request.raw_address

    # Step 1: Parse raw text into structured address via LLM
    try:
        parsed_address = await parser.parse(raw_text)
    except LLMTimeoutError:
        return ParseValidationResult(
            raw_text=raw_text,
            parsed_address=None,
            validation_result=None,
            status="service_unavailable",
            error_message="LLM service is unavailable",
        )
    except LLMParseError as exc:
        return ParseValidationResult(
            raw_text=raw_text,
            parsed_address=None,
            validation_result=None,
            status="parse_failed",
            error_message=str(exc),
        )
    except (NotImplementedError, Exception):
        return ParseValidationResult(
            raw_text=raw_text,
            parsed_address=None,
            validation_result=None,
            status="service_unavailable",
            error_message="LLM service is unavailable",
        )

    # Step 2: Validate the parsed address via USPS
    validation_result = await validator.validate(parsed_address)

    # Determine overall status based on validation result
    status = validation_result.status if validation_result.status in ("valid", "invalid") else "invalid"

    return ParseValidationResult(
        raw_text=raw_text,
        parsed_address=parsed_address,
        validation_result=validation_result,
        status=status,
        error_message=validation_result.error_message,
    )
