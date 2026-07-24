"""Route for bulk address validation endpoint.

Exposes POST /validate/bulk which accepts a multipart Excel file upload,
validates file format and size constraints, and delegates to BulkProcessor
for row-by-row address validation.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from app.adapters.usps_adapter import USPSAdapterInterface, get_usps_adapter
from app.models.validation import BulkValidationResult
from app.services.address_validator import AddressValidator
from app.services.bulk_processor import (
    BulkProcessor,
    FileTooLargeError,
    InvalidFileFormatError,
    RowLimitExceededError,
)

router = APIRouter()


def _get_bulk_processor(
    adapter: USPSAdapterInterface = Depends(get_usps_adapter),
) -> BulkProcessor:
    """Dependency that provides a BulkProcessor wired with an AddressValidator."""
    validator = AddressValidator(usps_adapter=adapter)
    return BulkProcessor(validator=validator)


@router.post("/validate/bulk", response_model=BulkValidationResult)
async def validate_bulk(
    file: UploadFile = File(...),
    processor: BulkProcessor = Depends(_get_bulk_processor),
) -> BulkValidationResult:
    """Validate addresses from an uploaded Excel file in bulk.

    Accepts a multipart file upload of an Excel file (.xlsx or .xls).
    The file must not exceed 10MB and must contain at most 1000 address rows.

    Returns a BulkValidationResult containing a ValidationResult for each row,
    preserving the original row order.

    Error responses (400):
    - INVALID_FILE_FORMAT: File is not .xlsx or .xls
    - FILE_TOO_LARGE: File exceeds 10MB
    - ROW_LIMIT_EXCEEDED: File contains more than 1000 rows
    """
    try:
        result = await processor.process_file(file)
    except InvalidFileFormatError as e:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "INVALID_FILE_FORMAT",
                "message": e.message,
                "fields": [],
            },
        )
    except FileTooLargeError as e:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "FILE_TOO_LARGE",
                "message": e.message,
                "fields": [],
            },
        )
    except RowLimitExceededError as e:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "ROW_LIMIT_EXCEEDED",
                "message": e.message,
                "fields": [],
            },
        )

    return result
