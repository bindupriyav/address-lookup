import os


USPS_API_KEY: str = os.environ.get("USPS_API_KEY", "mock")
PORT: int = int(os.environ.get("PORT", "8000"))
