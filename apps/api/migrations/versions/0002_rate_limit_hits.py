"""rate limit counters shared across API instances

Revision ID: 0002
Revises: 0001
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rate_limit_hits",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("key", "window_start"),
    )
    op.create_index(
        op.f("ix_rate_limit_hits_expires_at"), "rate_limit_hits", ["expires_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_rate_limit_hits_expires_at"), table_name="rate_limit_hits")
    op.drop_table("rate_limit_hits")
