"""Property-based tests for AddressValidator normalization methods.

Feature: usps-address-validation, Property 8: check_address uppercases all input
Feature: usps-address-validation, Property 9: check_address and verify_address consistency
Validates: Requirements 9.2, 9.7
"""

from hypothesis import given, settings
from hypothesis import strategies as st

from app.adapters.mock_usps import MockUSPSAdapter
from app.services.address_validator import AddressValidator


# Instantiate the validator with a mock adapter for testing normalization methods
_validator = AddressValidator(usps_adapter=MockUSPSAdapter())


@given(address=st.text(max_size=20))
@settings(max_examples=10)
def test_check_address_uppercases_all_input(address: str):
    """Property 8: check_address uppercases all input.

    For any string input, calling check_address SHALL return a string
    equal to the input converted to uppercase.

    Feature: usps-address-validation, Property 8: check_address uppercases all input
    Validates: Requirements 9.2
    """
    result = _validator.check_address(address)
    assert result == address.upper()


@given(address=st.text(max_size=20))
@settings(max_examples=10)
def test_check_address_and_verify_address_consistency(address: str):
    """Property 9: check_address and verify_address consistency.

    For any string input, check_address(input) SHALL produce the same
    output as verify_address(input).

    Feature: usps-address-validation, Property 9: check_address and verify_address consistency
    Validates: Requirements 9.7
    """
    check_result = _validator.check_address(address)
    verify_result = _validator.verify_address(address)
    assert check_result == verify_result
