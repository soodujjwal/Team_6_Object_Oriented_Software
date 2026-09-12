from app.repositories.base import BaseRepository
from app.repositories.models import AccountModel


class AccountRepository(BaseRepository[AccountModel]):
    model = AccountModel

