import logging
import math
import os
from collections.abc import Mapping
from dataclasses import dataclass
from functools import lru_cache

logger = logging.getLogger(__name__)

DEFAULT_ADO_ALLOWED_HOSTS = "dev.azure.com,*.visualstudio.com,tfs-projects.cmf.criticalmanufacturing.com"
DEFAULT_ADO_TIMEOUT_SECONDS = 30.0


@dataclass(frozen=True)
class Settings:
    """Server settings read from the environment (see plans/release-plan-ado.md).

    `ado_allowed_hosts` is the SSRF allowlist for the Azure DevOps proxy: exact
    host names, or `*.example.com` for any subdomain of example.com.
    """

    ado_allowed_hosts: tuple[str, ...]
    ado_timeout_seconds: float

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> "Settings":
        env = os.environ if environ is None else environ
        return cls(
            ado_allowed_hosts=parse_allowed_hosts(env.get("ADO_ALLOWED_HOSTS")),
            ado_timeout_seconds=_parse_timeout(env.get("ADO_TIMEOUT_SECONDS")),
        )


def parse_allowed_hosts(raw: str | None) -> tuple[str, ...]:
    """Split a comma-separated host list: entries trimmed, lower-cased, blanks
    dropped. A value with no entries (unset, blank, ",,") means the default
    list, since an empty allowlist would silently refuse every host."""
    entries = tuple(entry.strip().lower() for entry in (raw or "").split(",") if entry.strip())
    if not entries:
        entries = tuple(DEFAULT_ADO_ALLOWED_HOSTS.split(","))
    return entries


def _parse_timeout(raw: str | None) -> float:
    if raw is None or not raw.strip():
        return DEFAULT_ADO_TIMEOUT_SECONDS
    try:
        value = float(raw)
    except ValueError:
        value = 0.0
    if not math.isfinite(value) or value <= 0:
        logger.warning("Ignoring invalid ADO_TIMEOUT_SECONDS; using %s", DEFAULT_ADO_TIMEOUT_SECONDS)
        return DEFAULT_ADO_TIMEOUT_SECONDS
    return value


@lru_cache
def get_settings() -> Settings:
    """The process-wide settings, read once. Used as a FastAPI dependency so
    tests can replace it through `app.dependency_overrides`."""
    return Settings.from_env()
