from datetime import date
from decimal import Decimal

from sqlalchemy import JSON, Boolean, Date, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    phone_number: Mapped[str] = mapped_column(String(14), nullable=False, default="")
    occupation: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)


class AccountModel(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    bank_name: Mapped[str] = mapped_column(String(100), nullable=False, default="Other")
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    starting_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    account_type: Mapped[str] = mapped_column(String(20), nullable=False, default="other")

    transactions: Mapped[list["TransactionModel"]] = relationship(
        cascade="all, delete-orphan",
        back_populates="account",
    )


class TransferModel(Base):
    __tablename__ = "transfers"

    id: Mapped[int] = mapped_column(primary_key=True)
    from_account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), nullable=False, index=True)
    to_account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    transfer_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    note: Mapped[str | None] = mapped_column(String(255))


class TransactionModel(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    transaction_type: Mapped[str] = mapped_column(String(20), nullable=False)
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(String(255))
    receipt_items: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    receipt_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    account: Mapped[AccountModel] = relationship(back_populates="transactions")


class FriendModel(Base):
    __tablename__ = "friends"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))


class SplitBillModel(Base):
    __tablename__ = "split_bills"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    data: Mapped[dict] = mapped_column(JSON)
    payment_transaction_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    repayments: Mapped[dict] = mapped_column(JSON, default=dict)


class BudgetModel(Base):
    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    monthly_limit: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    month: Mapped[int] = mapped_column(nullable=False)
    year: Mapped[int] = mapped_column(nullable=False)


class SavingsGoalModel(Base):
    __tablename__ = "savings_goals"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    target_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    current_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    monthly_income: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    target_date: Mapped[date | None] = mapped_column(Date)


class RecurringTransactionModel(Base):
    __tablename__ = "recurring_transactions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    transaction_type: Mapped[str] = mapped_column(String(20), nullable=False)
    frequency: Mapped[str] = mapped_column(String(20), nullable=False)
    next_due_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(String(255))
    auto_pay_status: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reminder_settings: Mapped[list[int] | None] = mapped_column(JSON, nullable=True)
    last_paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_matched_transaction_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
