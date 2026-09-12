from app.repositories.base import BaseRepository
from app.repositories.models import UserModel


class UserRepository(BaseRepository[UserModel]):
    model = UserModel

    def get_by_email(self, email: str) -> UserModel | None:
        return self.db.query(UserModel).filter_by(email=email.lower()).first()
