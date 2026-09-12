from app.domain.notification import AlertLevel
from app.schemas.common import ORMModel


class NotificationRead(ORMModel):
    message: str
    level: AlertLevel
    source: str

