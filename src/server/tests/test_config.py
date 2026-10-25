import pytest

from app.config import DEFAULT_ADO_TIMEOUT_SECONDS, Settings, get_settings, parse_allowed_hosts

ONPREM_HOST = "tfs-projects.cmf.criticalmanufacturing.com"


def test_settings_defaults():
    settings = Settings.from_env({})
    assert settings.ado_allowed_hosts == ("dev.azure.com", "*.visualstudio.com", ONPREM_HOST)
    assert settings.ado_timeout_seconds == DEFAULT_ADO_TIMEOUT_SECONDS == 30.0


def test_settings_parse_hosts_trimmed_lowercased_blanks_dropped():
    settings = Settings.from_env({"ADO_ALLOWED_HOSTS": " TFS.Example.com, ,*.Foo.org,, ", "ADO_TIMEOUT_SECONDS": "12.5"})
    assert settings.ado_allowed_hosts == ("tfs.example.com", "*.foo.org")
    assert settings.ado_timeout_seconds == 12.5


@pytest.mark.parametrize("raw", ["", "   ", ",,"])
def test_settings_blank_hosts_fall_back_to_default(raw):
    # No entries at all: an empty allowlist would refuse every host.
    assert Settings.from_env({"ADO_ALLOWED_HOSTS": raw}).ado_allowed_hosts == parse_allowed_hosts(None)


@pytest.mark.parametrize("raw", ["abc", "0", "-5", "nan", "inf", ""])
def test_settings_invalid_timeout_falls_back_to_default(raw):
    assert Settings.from_env({"ADO_TIMEOUT_SECONDS": raw}).ado_timeout_seconds == DEFAULT_ADO_TIMEOUT_SECONDS


def test_settings_from_process_environment(monkeypatch):
    monkeypatch.setenv("ADO_ALLOWED_HOSTS", "tfs.example.com")
    monkeypatch.setenv("ADO_TIMEOUT_SECONDS", "5")
    assert Settings.from_env() == Settings(ado_allowed_hosts=("tfs.example.com",), ado_timeout_seconds=5.0)


def test_get_settings_is_cached():
    assert get_settings() is get_settings()
