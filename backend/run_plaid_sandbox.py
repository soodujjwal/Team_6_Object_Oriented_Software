"""Run the isolated Plaid test-bank demo alongside the original backend."""
import os

import uvicorn


if __name__ == "__main__":
    os.environ["FINANCE_PROFILE"] = "plaid-sandbox"
    uvicorn.run("app.main:app", host="127.0.0.1", port=8001, reload=True)
