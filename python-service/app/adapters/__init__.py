"""USPS adapter layer with interface, factory, and implementations."""

from app.adapters.usps_adapter import USPSAdapterInterface, get_usps_adapter

__all__ = ["USPSAdapterInterface", "get_usps_adapter"]
