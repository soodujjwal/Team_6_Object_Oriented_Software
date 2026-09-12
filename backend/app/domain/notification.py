from dataclasses import dataclass
from enum import StrEnum


class AlertLevel(StrEnum):
    INFO = "info"
    WARNING = "warning"
    DANGER = "danger"


@dataclass(frozen=True)
class Notification:
    message: str
    level: AlertLevel
    source: str

