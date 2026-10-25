import pytest

from app.config import parse_allowed_hosts
from app.services.ado_url import (
    CLOUD_SHAPE,
    HTTPS_REQUIRED,
    ONPREM_SHAPE,
    PAT_REQUIRED,
    SOURCE_REQUIRED,
    URL_REQUIRED,
    AdoUrlError,
    connection_field_errors,
    host_allowed,
    parse_project_url,
)

ALLOWED = parse_allowed_hosts(None)
ONPREM_HOST = "tfs-projects.cmf.criticalmanufacturing.com"


def _error(source, url, allowed=ALLOWED):
    with pytest.raises(AdoUrlError) as info:
        parse_project_url(source, url, allowed)
    return str(info.value)


# --- host_allowed -----------------------------------------------------------


@pytest.mark.parametrize(
    "host, expected",
    [
        ("contoso.visualstudio.com", True),
        ("a.b.visualstudio.com", True),
        ("visualstudio.com", False),
        ("evilvisualstudio.com", False),
        ("dev.azure.com", True),
        ("DEV.Azure.COM", True),
        ("x.dev.azure.com", False),
        ("dev.azure.com.evil.example", False),
    ],
)
def test_host_allowed_wildcard_and_exact(host, expected):
    assert host_allowed(host, ["dev.azure.com", "*.visualstudio.com"]) is expected


def test_host_allowed_patterns_are_case_insensitive():
    assert host_allowed("tfs.example.com", ["TFS.Example.com"])
    assert host_allowed("a.example.com", ["*.EXAMPLE.com"])


def test_host_allowed_empty_list_refuses_everything():
    assert not host_allowed("dev.azure.com", [])


# --- connection_field_errors -----------------------------------------------


def test_connection_fields_all_missing_reports_all_in_order():
    assert connection_field_errors({}) == [SOURCE_REQUIRED, URL_REQUIRED, PAT_REQUIRED]


@pytest.mark.parametrize("source", ["", "  ", "Cloud", "azure", None, 1])
def test_connection_fields_invalid_source(source):
    data = {"source": source, "projectUrl": "https://dev.azure.com/o/p", "pat": "x"}
    assert connection_field_errors(data) == [SOURCE_REQUIRED]


@pytest.mark.parametrize("value", ["", "   ", None, 5, ["x"]])
def test_connection_fields_blank_url_and_pat(value):
    data = {"source": "cloud", "projectUrl": value, "pat": value}
    assert connection_field_errors(data) == [URL_REQUIRED, PAT_REQUIRED]


def test_connection_fields_valid():
    assert connection_field_errors({"source": "onprem", "projectUrl": "u", "pat": "p"}) == []


def test_contract_messages_are_verbatim():
    assert SOURCE_REQUIRED == "Choose the Azure DevOps source (On-Prem or Collaboration Hub)."
    assert URL_REQUIRED == "Enter the Azure DevOps project URL."
    assert PAT_REQUIRED == "Enter a Personal Access Token."
    assert HTTPS_REQUIRED == "The URL must start with https://."
    assert CLOUD_SHAPE == "Collaboration Hub URLs look like https://dev.azure.com/<organization>/<project>."
    assert ONPREM_SHAPE == "On-Prem URLs look like https://<server>/<collection>/<project>."


# --- parse_project_url: valid URLs -------------------------------------------


def test_cloud_dev_azure_url():
    project = parse_project_url("cloud", "https://dev.azure.com/contoso/Fabrikam", ALLOWED)
    assert project.kind == "cloud"
    assert project.base_url == "https://dev.azure.com/contoso"
    assert project.project == "Fabrikam"
    assert project.project_url == "https://dev.azure.com/contoso/Fabrikam"
    assert project.host == "dev.azure.com"


def test_cloud_visualstudio_url():
    project = parse_project_url("cloud", "https://contoso.visualstudio.com/Fabrikam/", ALLOWED)
    assert project.base_url == "https://contoso.visualstudio.com"
    assert project.project == "Fabrikam"
    assert project.project_url == "https://contoso.visualstudio.com/Fabrikam"


def test_onprem_url():
    url = f"https://{ONPREM_HOST}/ImplementationProjects/PROJ_X"
    project = parse_project_url("onprem", url, ALLOWED)
    assert project.kind == "onprem"
    assert project.base_url == f"https://{ONPREM_HOST}/ImplementationProjects"
    assert project.project == "PROJ_X"
    assert project.project_url == url


def test_onprem_url_keeps_explicit_port():
    project = parse_project_url("onprem", "https://tfs.example.com:8443/Coll/Proj", ["tfs.example.com"])
    assert project.base_url == "https://tfs.example.com:8443/Coll"


@pytest.mark.parametrize(
    "suffix",
    [
        "/",
        "/_apis/projects",
        "/_backlogs/backlog/Team/Epics",
        "/_workitems/edit/123",
        "/_boards/board/t/Team/Features",
        "/_git/repo",
        "?a=1",
        "#frag",
        "/_workitems?_a=edit&id=1#x",
        "//",
    ],
)
def test_suffixes_query_and_fragment_are_stripped(suffix):
    project = parse_project_url("cloud", f"https://dev.azure.com/contoso/Fabrikam{suffix}", ALLOWED)
    assert project.project_url == "https://dev.azure.com/contoso/Fabrikam"


def test_encoded_project_name_decoded_for_display_and_reencoded():
    project = parse_project_url("cloud", "https://dev.azure.com/contoso/Fabrikam%20Plant%2BLine", ALLOWED)
    assert project.project == "Fabrikam Plant+Line"
    assert project.project_url == "https://dev.azure.com/contoso/Fabrikam%20Plant%2BLine"


def test_unencoded_space_is_encoded_in_canonical_url():
    project = parse_project_url("onprem", f"https://{ONPREM_HOST}/My Collection/My Project", ALLOWED)
    assert project.project == "My Project"
    assert project.base_url == f"https://{ONPREM_HOST}/My%20Collection"
    assert project.project_url == f"https://{ONPREM_HOST}/My%20Collection/My%20Project"


@pytest.mark.parametrize(
    "source, url",
    [
        ("cloud", "https://dev.azure.com/contoso/Fabrikam%20Plant%2BLine"),
        ("cloud", "https://contoso.visualstudio.com/F%C3%A1brica%20%23%25"),
        ("onprem", f"https://{ONPREM_HOST}:8443/My%20Collection/My%20Project"),
        ("onprem", f"https://{ONPREM_HOST}/Coll/o%25ZZ%26%3F"),
    ],
)
def test_canonical_url_reparses_to_itself(source, url):
    # A board stores the canonical projectUrl and resends it on sync.
    project = parse_project_url(source, url, ALLOWED)
    assert project.project_url == url
    again = parse_project_url(source, project.project_url, ALLOWED)
    assert (again.base_url, again.project, again.project_url) == (project.base_url, project.project, url)


def test_scheme_and_host_case_and_whitespace_tolerated():
    project = parse_project_url("cloud", "  HTTPS://Dev.Azure.com/contoso/Fabrikam  ", ALLOWED)
    assert project.project_url == "https://dev.azure.com/contoso/Fabrikam"


# --- parse_project_url: errors ---------------------------------------------


@pytest.mark.parametrize(
    "url",
    ["http://dev.azure.com/contoso/Fabrikam", "dev.azure.com/contoso/Fabrikam", "ftp://dev.azure.com/a/b", "https:/x"],
)
def test_non_https_rejected(url):
    assert _error("cloud", url) == HTTPS_REQUIRED


def test_disallowed_host_rejected_before_shape():
    assert _error("cloud", "https://evil.example.com/a/b") == "This Azure DevOps host is not allowed: evil.example.com."
    assert _error("onprem", "https://EVIL.example.com/x") == "This Azure DevOps host is not allowed: evil.example.com."


def test_bare_wildcard_parent_not_allowed():
    assert _error("cloud", "https://visualstudio.com/Fabrikam") == "This Azure DevOps host is not allowed: visualstudio.com."


def test_host_removed_from_allowlist_is_refused():
    assert _error("cloud", "https://dev.azure.com/o/p", allowed=("*.visualstudio.com",)) == (
        "This Azure DevOps host is not allowed: dev.azure.com."
    )


@pytest.mark.parametrize(
    "url",
    [
        "https://dev.azure.com/contoso",
        "https://dev.azure.com/contoso/",
        "https://dev.azure.com/contoso/Fabrikam/extra",
        "https://dev.azure.com/_apis/projects",
        "https://dev.azure.com/contoso/%20",
        "https://contoso.visualstudio.com/",
        "https://contoso.visualstudio.com/Coll/Fabrikam",
        "https://a.b.visualstudio.com/Fabrikam",
        f"https://{ONPREM_HOST}/ImplementationProjects/PROJ",
        "https://",
        "https://user:secret@dev.azure.com/contoso/Fabrikam",
    ],
)
def test_cloud_shape_errors(url):
    assert _error("cloud", url) == CLOUD_SHAPE


@pytest.mark.parametrize(
    "url",
    [
        f"https://{ONPREM_HOST}/ImplementationProjects",
        f"https://{ONPREM_HOST}/",
        f"https://{ONPREM_HOST}/Coll/Proj/extra",
        f"https://{ONPREM_HOST}/_apis/projects",
        f"https://{ONPREM_HOST}/Coll/a%2Fb",
        "https://contoso.visualstudio.com/Fabrikam",
        f"https://{ONPREM_HOST}:notaport/Coll/Proj",
    ],
)
def test_onprem_shape_errors(url):
    assert _error("onprem", url) == ONPREM_SHAPE


# --- host syntax and dot segments --------------------------------------------


@pytest.mark.parametrize("source, shape", [("onprem", ONPREM_SHAPE), ("cloud", CLOUD_SHAPE)])
@pytest.mark.parametrize(
    "host",
    [
        "xn--zz.visualstudio.com",  # invalid punycode label
        "x\u0000.visualstudio.com",  # NUL
        "evil.com\\.visualstudio.com",
        "evil.com%2f.visualstudio.com",
        "evil.com .visualstudio.com",
        "-bad.visualstudio.com",
        "bad-.visualstudio.com",
        "a..visualstudio.com",
        f"{'a' * 64}.visualstudio.com",
        "evil.com\u2100.visualstudio.com",  # IDNA maps it to "a/c"
        "dev.azure.com.",
    ],
)
def test_malformed_host_gets_the_shape_message_for_the_source(source, shape, host):
    assert _error(source, f"https://{host}/Coll/Proj", allowed=("*.visualstudio.com", "dev.azure.com")) == shape


def test_malformed_host_rejected_even_when_not_on_the_allowlist():
    assert _error("onprem", "https://evil\\host/Coll/Proj") == ONPREM_SHAPE


def test_max_length_label_is_accepted():
    host = f"{'a' * 63}.visualstudio.com"
    assert parse_project_url("onprem", f"https://{host}/Coll/Proj", ("*.visualstudio.com",)).host == host


def test_unicode_host_is_idna_encoded_before_the_allowlist():
    project = parse_project_url("onprem", "https://b\u00fccher.visualstudio.com/Coll/Proj", ("*.visualstudio.com",))
    assert project.base_url == "https://xn--bcher-kva.visualstudio.com/Coll"


def test_valid_punycode_host_is_accepted():
    project = parse_project_url("onprem", "https://xn--bcher-kva.visualstudio.com/Coll/Proj", ("*.visualstudio.com",))
    assert project.host == "xn--bcher-kva.visualstudio.com"


def test_ipv4_onprem_host_still_parsed():
    project = parse_project_url("onprem", "https://10.0.0.5:8443/Coll/Proj", ("10.0.0.5",))
    assert project.base_url == "https://10.0.0.5:8443/Coll"


@pytest.mark.parametrize("source, shape", [("onprem", ONPREM_SHAPE), ("cloud", CLOUD_SHAPE)])
@pytest.mark.parametrize("path", ["/../x", "/./x", "/a/..", "/%2e%2e/x", "/a/%2E"])
def test_dot_path_segments_rejected(source, shape, path):
    host = "dev.azure.com" if source == "cloud" else ONPREM_HOST
    assert _error(source, f"https://{host}{path}") == shape


# --- non-encodable input and unusable path segments ----------------------------


@pytest.mark.parametrize("source, shape", [("onprem", ONPREM_SHAPE), ("cloud", CLOUD_SHAPE)])
@pytest.mark.parametrize(
    "path",
    [
        "/Coll/Fab\ud800rikam",  # lone surrogate in the project
        "/Co\udfffll/Proj",  # ... in the organization / collection
        "/Coll/Proj?q=\ud800",  # ... even in an ignored part
        "/Coll/Pr%00oj",  # encoded control characters
        "/Coll/Pr%1Foj",
        "/Coll/Pr%7Foj",
        "/Co%0All/Proj",
        "/Coll/Pr\x00oj",  # raw control character
        "/Coll/Pr%FFoj",  # escape that is not valid UTF-8 (would decode to U+FFFD)
        "/Coll/%C3",  # truncated UTF-8 sequence
        "/Coll/%ED%A0%80",  # UTF-8-encoded surrogate
    ],
)
def test_unusable_segments_get_the_shape_message(source, shape, path):
    host = "dev.azure.com" if source == "cloud" else ONPREM_HOST
    assert _error(source, f"https://{host}{path}") == shape


def test_https_rule_still_comes_first_for_non_encodable_urls():
    assert _error("cloud", "http://dev.azure.com/contoso/\ud800") == HTTPS_REQUIRED


def test_stray_percent_is_kept_literally_and_reencoded():
    project = parse_project_url("cloud", "https://dev.azure.com/o%ZZ/Fabrikam%20Plant", ALLOWED)
    assert project.base_url == "https://dev.azure.com/o%25ZZ"


def test_valid_multibyte_escape_is_decoded():
    project = parse_project_url("cloud", "https://dev.azure.com/contoso/F%C3%A1brica", ALLOWED)
    assert project.project == "Fábrica"
    assert project.project_url == "https://dev.azure.com/contoso/F%C3%A1brica"
