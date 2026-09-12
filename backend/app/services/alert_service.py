from app.domain.notification import AlertLevel, Notification
from app.schemas.budget_schema import BudgetRead


class AlertService:
    def budget_alerts(self, budgets: list[BudgetRead]) -> list[Notification]:
        alerts: list[Notification] = []
        for budget in budgets:
            usage = budget.usage_percent or 0
            if usage >= 100:
                alerts.append(
                    Notification(
                        message=f"{budget.category} budget is over its monthly limit.",
                        level=AlertLevel.DANGER,
                        source="budget",
                    )
                )
            elif usage >= 80:
                alerts.append(
                    Notification(
                        message=f"{budget.category} budget is close to its monthly limit.",
                        level=AlertLevel.WARNING,
                        source="budget",
                    )
                )
        return alerts

