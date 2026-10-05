import pytest

from app.config import Settings
from app.knowledge import build_index


@pytest.fixture
def settings(tmp_path):
    config = Settings(
        database=tmp_path / "knowledge.sqlite3", generation_enabled=False, api_token=""
    )
    build_index(config.corpus, config.database)
    return config
