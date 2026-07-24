"""Unit tests for USPS adapter interface and factory function."""

import os
from unittest.mock import patch

import pytest

from app.adapters.mock_usps import MockUSPSAdapter
from app.adapters.real_usps import RealUSPSAdapter
from app.adapters.usps_adapter import USPSAdapterInterface, get_usps_adapter


class TestUSPSAdapterInterface:
    """Tests verifying the ABC interface contract."""

    def test_interface_cannot_be_instantiated(self):
        """USPSAdapterInterface is abstract and cannot be instantiated directly."""
        with pytest.raises(TypeError):
            USPSAdapterInterface()

    def test_mock_adapter_implements_interface(self):
        """MockUSPSAdapter is a valid implementation of USPSAdapterInterface."""
        adapter = MockUSPSAdapter()
        assert isinstance(adapter, USPSAdapterInterface)

    def test_real_adapter_implements_interface(self):
        """RealUSPSAdapter is a valid implementation of USPSAdapterInterface."""
        adapter = RealUSPSAdapter(api_key="test-key")
        assert isinstance(adapter, USPSAdapterInterface)


class TestGetUspsAdapterFactory:
    """Tests verifying the factory function selects the correct adapter."""

    @patch.dict(os.environ, {}, clear=True)
    def test_returns_mock_when_env_not_set(self):
        """Factory returns MockUSPSAdapter when USPS_API_KEY is not set."""
        # Remove USPS_API_KEY if present
        os.environ.pop("USPS_API_KEY", None)
        adapter = get_usps_adapter()
        assert isinstance(adapter, MockUSPSAdapter)

    @patch.dict(os.environ, {"USPS_API_KEY": "mock"})
    def test_returns_mock_when_env_is_mock(self):
        """Factory returns MockUSPSAdapter when USPS_API_KEY is 'mock'."""
        adapter = get_usps_adapter()
        assert isinstance(adapter, MockUSPSAdapter)

    @patch.dict(os.environ, {"USPS_API_KEY": ""})
    def test_returns_mock_when_env_is_empty(self):
        """Factory returns MockUSPSAdapter when USPS_API_KEY is empty string."""
        adapter = get_usps_adapter()
        assert isinstance(adapter, MockUSPSAdapter)

    @patch.dict(os.environ, {"USPS_API_KEY": "real-api-key-123"})
    def test_returns_real_when_env_is_real_key(self):
        """Factory returns RealUSPSAdapter when USPS_API_KEY is a real key."""
        adapter = get_usps_adapter()
        assert isinstance(adapter, RealUSPSAdapter)
        assert adapter.api_key == "real-api-key-123"

    @patch.dict(os.environ, {"USPS_API_KEY": "some-other-value"})
    def test_returns_real_for_any_non_mock_value(self):
        """Factory returns RealUSPSAdapter for any non-mock, non-empty value."""
        adapter = get_usps_adapter()
        assert isinstance(adapter, RealUSPSAdapter)
