"""The migrations must build exactly the schema the models describe, and be reversible."""

from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect

from app.database import Base

ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


def alembic_config(url: str) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", url)
    return config


def test_migrations_match_models_and_downgrade_cleanly(tmp_path):
    url = f"sqlite:///{(tmp_path / 'migrations.db').as_posix()}"
    config = alembic_config(url)

    command.upgrade(config, "head")
    engine = create_engine(url)
    with engine.connect() as connection:
        differences = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    assert differences == [], f"Models changed without a migration: {differences}"

    command.downgrade(config, "base")
    assert inspect(engine).get_table_names() == ["alembic_version"]
    command.upgrade(config, "head")  # and back up again
    engine.dispose()
