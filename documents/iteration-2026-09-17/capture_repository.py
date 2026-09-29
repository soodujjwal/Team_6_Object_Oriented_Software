"""Capture code/schema/history evidence without reading the application's data."""
import ast
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
EVIDENCE = HERE / "evidence"


def git(*args):
    result = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def purpose(path):
    name = Path(path).stem
    special = {
        "App": "Session restoration and page selection; connects page callbacks and the application shell.",
        "client": "Shared HTTP transport, bearer authorization, cached-session validation, and 401 handling.",
        "models": "SQLAlchemy persistence models for all nine database tables.",
        "database": "Database engine, sessions, schema creation, and incremental compatibility migrations.",
        "security": "Password hashing, JWT creation/verification, and current-user dependency.",
        "config": "Local API, SQLite, signing-key, and token-lifetime settings.",
        "base": "Generic repository CRUD implementation.",
        "money": "Decimal cent rounding and nonnegative monetary validation.",
        "splitBill": "Client item allocation and proportional tax/tip calculation using integer cents.",
        "splitReceipt": "Split Bill image OCR, timeout/error handling, and receipt-text parsing.",
        "receiptExtraction": "Unconfigured extraction interfaces for general receipt and PDF imports.",
        "budgeting": "Monthly budget aggregation, classification, preferences, and spending projection.",
        "purchaseAnalysis": "Cash, loan, and lease decision-support calculations and financial snapshots.",
        "merchantIntelligence": "Merchant/category and subscription suggestions using local rules.",
        "recurringBills": "Due-date status, upcoming bills, and reminder notification construction.",
        "types": "Shared TypeScript finance data contracts.",
        "banks": "Supported bank-name options for user-entered accounts; no bank integration.",
        "transactionCategories": "Fixed income and expense category option catalogs.",
        "PlaceholderPage": "Placeholder presentation component; not selected by current App navigation.",
        "README": "Project setup and feature documentation; some Split Bill wording predates the simplified UI.",
        "COMPONENTS": "Shared dropdown/date-picker conventions.",
        "package": "Frontend dependencies and npm scripts.",
        "package-lock": "Resolved frontend dependency versions and integrity hashes.",
        "pyproject": "Backend package metadata, Python dependencies, and pytest configuration.",
        "tsconfig": "TypeScript compiler options.",
        "vite.config": "Vite development/build configuration.",
        "Inception": "Committed project inception artifact.",
    }
    if name == "__init__": return "Python package marker."
    if path.endswith(".css"): return "Styling: " + name + "; theme/layout/presentation rules, not business logic."
    if path == "backend/app/main.py": return "FastAPI application creation, middleware, route registration, and system endpoints."
    if path == "frontend/src/main.tsx": return "React root mounting and shared stylesheet imports."
    if name in special: return special[name]
    words = re.sub(r"(?<!^)(?=[A-Z])", " ", name).replace("_", " ")
    if "/tests/" in path: return "Automated verification: " + words + "."
    if "/api/" in path: return ("HTTP route definitions: " if path.startswith("backend") else "Typed API calls and, where implemented, refresh events: ") + words + "."
    if "/schemas/" in path: return "Pydantic input/output validation contracts: " + words + "."
    if "/repositories/" in path: return "Persistence access for " + words + "."
    if "/services/" in path: return "Application workflow and validation orchestration: " + words + "."
    if "/domain/" in path: return "Business value objects, calculation rules, or supporting enumerations: " + words + "."
    if "/pages/" in path: return "Screen implementation: " + words + "."
    if "/components/" in path: return "Reusable presentation component: " + words + "."
    if "/utils/" in path: return "Formatting/input helper: " + words + "."
    if "/theme/" in path: return "Theme constants and types."
    if path.endswith("index.html"): return "Browser entry document and initial theme selection."
    if path.endswith(".gitignore"): return "Generated files, local databases, environments, and dependencies excluded from Git."
    return "Supporting source/configuration file: " + words + "."


def capture():
    files = sorted(set(git("ls-files").splitlines() + git("ls-files", "--others", "--exclude-standard").splitlines()))
    files = [p for p in files if not p.startswith("documents/") or p == "documents/Inception.pdf"]
    inventory, endpoints, tests = [], [], []
    for path in files:
        raw = (ROOT / path).read_bytes()
        entry = dict(path=path, bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(), purpose=purpose(path))
        if Path(path).suffix in {".py", ".ts", ".tsx", ".mjs", ".css", ".json", ".md", ".toml", ".html"} or path == ".gitignore":
            content = raw.decode("utf-8-sig")
            entry["lines"] = len(content.splitlines())
            if path.endswith(".py"):
                tree = ast.parse(content)
                entry["symbols"] = [n.name for n in tree.body if isinstance(n, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef))]
                tests.extend(dict(file=path, name=n.name) for n in tree.body if isinstance(n, ast.FunctionDef) and n.name.startswith("test_"))
                if "/api/" in path or path == "backend/app/main.py":
                    match = re.search(r'APIRouter\(prefix="([^"]+)"', content)
                    prefix = match.group(1) if match else ""
                    for node in ast.walk(tree):
                        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)): continue
                        for dec in node.decorator_list:
                            if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute) and dec.func.attr in {"get", "post", "put", "patch", "delete"} and dec.args and isinstance(dec.args[0], ast.Constant):
                                route = prefix + dec.args[0].value
                                endpoints.append(dict(method=dec.func.attr.upper(), path=route, handler=node.name, file=path, line=node.lineno,
                                    authentication="Public" if route in {"/", "/health", "/auth/login", "/auth/register"} else "Bearer token"))
            elif path.endswith((".ts", ".tsx", ".mjs")):
                entry["symbols"] = re.findall(r"export\s+(?:async\s+)?(?:function|class|type|const)\s+(\w+)", content)
        inventory.append(entry)
    sys.path.insert(0, str(ROOT / "backend"))
    from app.repositories.models import Base
    schema = []
    for table in Base.metadata.sorted_tables:
        schema.append(dict(table=table.name, columns=[dict(name=c.name, type=str(c.type), nullable=c.nullable,
            primary_key=c.primary_key, unique=bool(c.unique), foreign_keys=[fk.target_fullname for fk in c.foreign_keys]) for c in table.columns]))
    packages = {}
    for package in ["fastapi", "pydantic", "sqlalchemy", "uvicorn", "pytest", "httpx"]:
        packages[package] = importlib.metadata.version(package)
    lock = json.loads((ROOT / "frontend/package-lock.json").read_text(encoding="utf-8"))
    packages.update({name: lock["packages"]["node_modules/" + name]["version"] for name in ["react", "react-dom", "vite", "typescript", "lucide-react", "tesseract.js"]})
    snapshot = dict(captured_utc=datetime.now(timezone.utc).isoformat(), report_date="2026-09-17", head=git("rev-parse", "HEAD"),
        branch=git("branch", "--show-current"), remote=git("remote", "get-url", "origin"), history=git("log", "--format=%h %ad %s", "--date=short"),
        application_status=[line for line in git("status", "--porcelain").splitlines() if "documents/iteration-2026-09-17" not in line],
        python=sys.version.split()[0], packages=packages, file_count=len(inventory), endpoint_count=len(endpoints), table_count=len(schema))
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    for name, data in [("snapshot", snapshot), ("source-inventory", inventory), ("api-inventory", endpoints), ("schema-inventory", schema), ("test-functions", tests)]:
        (EVIDENCE / (name + ".json")).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(snapshot, indent=2))


if __name__ == "__main__":
    capture()
