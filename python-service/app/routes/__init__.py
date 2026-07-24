"""API route definitions for USPS address validation service.

Exposes a single APIRouter that aggregates all sub-route modules
(address, zipcode, parse, bulk) under the /api/v1 prefix.
"""

from fastapi import APIRouter

from app.routes.address import router as address_router
from app.routes.bulk import router as bulk_router
from app.routes.parse import router as parse_router
from app.routes.zipcode import router as zipcode_router

router = APIRouter(prefix="/api/v1")

router.include_router(address_router)
router.include_router(bulk_router)
router.include_router(parse_router)
router.include_router(zipcode_router)
