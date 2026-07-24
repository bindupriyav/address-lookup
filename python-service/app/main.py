"""FastAPI application entrypoint for USPS address validation service.

Creates the FastAPI app, wires up dependency injection for the USPS adapter
and AddressValidator, registers routes with /api/v1 prefix, and exposes
a health check endpoint.
"""

from fastapi import Depends, FastAPI

from app.adapters.usps_adapter import USPSAdapterInterface, get_usps_adapter
from app.config import PORT
from app.routes import router as api_router
from app.services.address_validator import AddressValidator

app = FastAPI(
    title="USPS Address Validation Service",
    version="1.0.0",
)


# --- Dependency injection ---


def get_address_validator(
    adapter: USPSAdapterInterface = Depends(get_usps_adapter),
) -> AddressValidator:
    """Dependency that provides an AddressValidator wired with the USPS adapter."""
    return AddressValidator(usps_adapter=adapter)


# --- Register routes ---

app.include_router(api_router)


# --- Health check ---


@app.get("/health")
async def health_check():
    """Health check endpoint for Cloud Run and load balancers.

    Returns 200 with JSON {"status": "healthy"}.
    """
    return {"status": "healthy"}


# --- Entrypoint ---

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=PORT, reload=True)
