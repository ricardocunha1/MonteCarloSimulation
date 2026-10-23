import asyncio
import base64
import json

import httpx
import pytest

from ado_fakes import FAKE_PAT, PROJECT_ID, PROJECT_NAME, FakeAdo, classification_nodes, error_response, mock_http_client
from app.services.ado_backlog import MAX_TREE_DEPTH, connect, normalize_node_path
from app.services.ado_client import PAT_REJECTED, UNEXPECTED_RESPONSE, AdoClient, AdoError, is_utf8_text
from app.services.ado_url import parse_project_url

BASE_URL = "https://dev.azure.com/contoso"
EXPECTED_AUTH = "Basic " + base64.b64encode(f":{FAKE_PAT}".encode()).decode()


def _call(handler, method="get", path="_apis/projects/P", params=None, body=None, timeout=None):
    async def go():
        async with mock_http_client(handler) as http:
            client = AdoClient(http, BASE_URL, FAKE_PAT, timeout)
            if method == "get":
                return await client.get_json(path, params)
            return await client.post_json(path, params, body)

    return asyncio.run(go())


def _ado_error(handler, **kwargs) -> AdoError:
    with pytest.raises(AdoError) as info:
        _call(handler, **kwargs)
    return info.value


def _connect(fake, url=f"https://dev.azure.com/contoso/{PROJECT_NAME}"):
    project = parse_project_url("cloud", url, ["dev.azure.com"])

    async def go():
        async with mock_http_client(fake) as http:
            return await connect(AdoClient(http, project.base_url, FAKE_PAT), project)

    return asyncio.run(go())


# --- AdoClient requests -----------------------------------------------------


def test_get_adds_api_version_auth_and_accept_headers():
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"ok": True})

    assert _call(handler, params={"$depth": 50}) == {"ok": True}
    (request,) = requests
    assert request.method == "GET"
    assert request.url.host == "dev.azure.com"
    assert request.url.path == "/contoso/_apis/projects/P"
    assert request.url.params["api-version"] == "7.0"
    assert request.url.params["$depth"] == "50"
    assert request.headers["Authorization"] == EXPECTED_AUTH
    assert request.headers["Accept"] == "application/json"
    assert FAKE_PAT not in str(request.url)


def test_post_sends_json_body_with_api_version():
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"id": 1})

    assert _call(handler, method="post", path="/P/_apis/wit/wiql", params={"$top": 1}, body={"query": "q"}) == {"id": 1}
    (request,) = requests
    assert request.method == "POST"
    assert request.url.path == "/contoso/P/_apis/wit/wiql"
    assert request.url.params["api-version"] == "7.0"
    assert request.headers["Authorization"] == EXPECTED_AUTH
    assert json.loads(request.content) == {"query": "q"}
    assert request.headers["Content-Type"] == "application/json"


def test_caller_cannot_override_api_version():
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={})

    _call(handler, params={"api-version": "5.0"})
    assert requests[0].url.params.get_list("api-version") == ["7.0"]


def test_redirects_are_not_followed():
    fake = FakeAdo(failures={"any": "302"})
    error = _ado_error(fake)
    assert str(error) == PAT_REJECTED
    assert error.status_code == 302
    assert len(fake.requests) == 1


def test_repr_does_not_expose_the_pat():
    async def go():
        async with mock_http_client(FakeAdo()) as http:
            return repr(AdoClient(http, BASE_URL, FAKE_PAT))

    assert FAKE_PAT not in asyncio.run(go())


# --- AdoClient error mapping -------------------------------------------------


@pytest.mark.parametrize("kind", ["401", "403", "203", "302", "non_json"])
def test_pat_rejection_mapping(kind):
    error = _ado_error(FakeAdo(failures={"any": kind}))
    assert str(error) == PAT_REJECTED


@pytest.mark.parametrize("kind", ["timeout", "connect"])
def test_transport_errors_map_to_unreachable(kind):
    error = _ado_error(FakeAdo(failures={"any": kind}))
    assert str(error) == "Could not reach Azure DevOps at dev.azure.com."
    assert error.status_code is None


def test_other_status_with_json_message():
    error = _ado_error(FakeAdo(failures={"any": "500"}))
    assert str(error) == "Azure DevOps returned an error (HTTP 500). Something broke on the server."
    assert error.status_code == 500


def test_other_status_without_json():
    error = _ado_error(FakeAdo(failures={"any": "502"}))
    assert str(error) == "Azure DevOps returned an error (HTTP 502)."


def test_404_keeps_status_for_the_caller():
    error = _ado_error(lambda request: error_response("404", request))
    assert error.status_code == 404
    assert str(error).startswith("Azure DevOps returned an error (HTTP 404).")


def test_json_message_that_is_not_text_is_ignored():
    error = _ado_error(lambda request: httpx.Response(409, json={"message": {"nested": 1}}))
    assert str(error) == "Azure DevOps returned an error (HTTP 409)."


def test_empty_2xx_body_is_a_pat_rejection():
    assert str(_ado_error(lambda request: httpx.Response(200, content=b""))) == PAT_REJECTED


@pytest.mark.parametrize(
    "content_type",
    ["application/json", "application/json; charset=utf-8", "Application/JSON", "application/problem+json"],
)
@pytest.mark.parametrize("content", [b"{not json", b"", b'{"a": 1', b"\xff\xfe\xfd"])
def test_undecodable_2xx_json_body_is_unexpected_response(content_type, content):
    def handler(request):
        return httpx.Response(200, content=content, headers={"Content-Type": content_type})

    assert str(_ado_error(handler)) == UNEXPECTED_RESPONSE


@pytest.mark.parametrize("content_type", ["text/html", "text/plain", "application/jsonp", "application/xml"])
def test_undecodable_2xx_non_json_body_is_still_a_pat_rejection(content_type):
    def handler(request):
        return httpx.Response(200, content=b"<html>Sign in</html>", headers={"Content-Type": content_type})

    assert str(_ado_error(handler)) == PAT_REJECTED


def test_203_with_json_content_type_is_still_a_pat_rejection():
    def handler(request):
        return httpx.Response(203, content=b"{not json", headers={"Content-Type": "application/json"})

    assert str(_ado_error(handler)) == PAT_REJECTED


@pytest.mark.parametrize("kind", ["401", "403", "203", "302", "404", "500", "502", "non_json", "timeout", "connect"])
def test_pat_never_in_error_messages(kind):
    error = _ado_error(FakeAdo(failures={"any": kind}))
    encoded = base64.b64encode(f":{FAKE_PAT}".encode()).decode()
    assert FAKE_PAT not in str(error)
    assert encoded not in str(error)
    assert "Authorization" not in str(error)


def test_timeout_is_passed_per_request():
    seen = []

    def handler(request):
        seen.append(request.extensions["timeout"])
        return httpx.Response(200, json={})

    _call(handler, timeout=7.5)
    assert seen[0]["read"] == 7.5


# --- normalize_node_path -------------------------------------------------------


@pytest.mark.parametrize(
    "path, expected",
    [
        ("\\Proj\\Area", "Proj"),
        ("\\Proj\\Iteration", "Proj"),
        ("\\Proj\\Area\\Team A", "Proj\\Team A"),
        ("\\Proj\\Iteration\\Phase 1\\Sprint 01", "Proj\\Phase 1\\Sprint 01"),
        ("\\Proj", "Proj"),
        ("Proj\\Area\\X", "Proj\\X"),
    ],
)
def test_normalize_node_path(path, expected):
    assert normalize_node_path(path) == expected


# --- connect (service) ------------------------------------------------------------


def test_connect_returns_project_and_trees():
    fake = FakeAdo()
    result = _connect(fake, url="https://dev.azure.com/contoso/fabrikam%20plant")
    assert result["project"] == {"id": PROJECT_ID, "name": PROJECT_NAME}
    assert result["projectUrl"] == "https://dev.azure.com/contoso/Fabrikam%20Plant"
    areas = result["areas"]
    assert areas["name"] == PROJECT_NAME and areas["path"] == PROJECT_NAME
    assert "finishDate" not in areas
    assert [c["path"] for c in areas["children"]] == [f"{PROJECT_NAME}\\Team A", f"{PROJECT_NAME}\\Team B"]
    assert areas["children"][0]["children"][0]["path"] == f"{PROJECT_NAME}\\Team A\\Squad 1"
    iterations = result["iterations"]
    assert iterations["finishDate"] == ""
    phase = iterations["children"][0]
    assert phase["finishDate"] == "2026-11-30"
    # Children keep the returned order (Sprint 02 before Sprint 01).
    assert [(c["name"], c["finishDate"]) for c in phase["children"]] == [("Sprint 02", "2026-11-13"), ("Sprint 01", "2026-10-30")]
    assert iterations["children"][1] == {"name": "Backlog", "path": f"{PROJECT_NAME}\\Backlog", "finishDate": "", "children": []}


def test_connect_calls_projects_then_classification_nodes_with_canonical_name():
    fake = FakeAdo()
    _connect(fake, url="https://dev.azure.com/contoso/FABRIKAM%20PLANT")
    projects, nodes = fake.requests
    assert projects.url.raw_path.startswith(b"/contoso/_apis/projects/FABRIKAM%20PLANT?")
    assert nodes.url.raw_path.startswith(b"/contoso/Fabrikam%20Plant/_apis/wit/classificationnodes?")
    assert nodes.url.params["$depth"] == "50"


def test_connect_project_404_maps_to_project_not_found():
    with pytest.raises(AdoError) as info:
        _connect(FakeAdo(), url="https://dev.azure.com/contoso/Other%20Proj")
    assert str(info.value) == "Project not found: Other Proj. Check the URL."


def test_connect_classification_404_is_not_project_not_found():
    with pytest.raises(AdoError) as info:
        _connect(FakeAdo(failures={"nodes": "404"}))
    assert str(info.value).startswith("Azure DevOps returned an error (HTTP 404).")


def test_connect_pat_rejected_on_projects_call_stops_there():
    fake = FakeAdo(failures={"projects": "401"})
    with pytest.raises(AdoError) as info:
        _connect(fake)
    assert str(info.value) == PAT_REJECTED
    assert len(fake.requests) == 1


@pytest.mark.parametrize(
    "nodes",
    [
        {"value": []},
        {"value": [classification_nodes()["value"][0]]},  # no iteration root
        {"nope": 1},
        {"value": [{"structureType": "area", "name": "P"}, classification_nodes()["value"][1]]},  # no path
    ],
)
def test_connect_unexpected_classification_payload(nodes):
    with pytest.raises(AdoError) as info:
        _connect(FakeAdo(nodes=nodes))
    assert str(info.value) == UNEXPECTED_RESPONSE


def test_connect_unexpected_project_payload():
    def handler(request):
        return httpx.Response(200, json={"value": []})

    with pytest.raises(AdoError) as info:
        _connect(handler)
    assert str(info.value) == UNEXPECTED_RESPONSE


def test_connect_non_string_finish_date_is_blank():
    nodes = classification_nodes()
    nodes["value"][1]["children"][1]["attributes"] = {"finishDate": None}
    result = _connect(FakeAdo(nodes=nodes))
    assert result["iterations"]["children"][1]["finishDate"] == ""


# --- AdoClient: non-transport httpx failures ---------------------------------


def test_undecodable_body_maps_to_unexpected_response():
    def handler(request):
        return httpx.Response(200, headers={"Content-Encoding": "gzip"}, content=b"not gzip")

    error = _ado_error(handler)
    assert str(error) == UNEXPECTED_RESPONSE
    assert FAKE_PAT not in str(error)


@pytest.mark.parametrize(
    "exc",
    [
        httpx.InvalidURL("bad url"),
        UnicodeError("label too long"),
        httpx.UnsupportedProtocol("no"),
        httpx.TooManyRedirects("loop"),
    ],
)
def test_other_request_side_errors_map_to_unreachable(exc):
    def handler(request):
        raise exc

    error = _ado_error(handler)
    assert str(error) == "Could not reach Azure DevOps at dev.azure.com."
    assert error.status_code is None


# --- unusable input / hostile responses ------------------------------------------


@pytest.mark.parametrize("pat", ["fake-pat-\ud800", "fake\x00pat", "fake\tpat", "fake\x7fpat", "fake\npat"])
def test_unusable_pat_is_rejected_without_a_request(pat):
    fake = FakeAdo()

    async def go():
        async with mock_http_client(fake) as http:
            AdoClient(http, BASE_URL, pat)

    with pytest.raises(AdoError) as info:
        asyncio.run(go())
    assert str(info.value) == PAT_REJECTED
    assert pat not in str(info.value)
    assert fake.requests == []


def test_non_ascii_pat_is_still_accepted():
    async def go():
        async with mock_http_client(FakeAdo()) as http:
            return AdoClient(http, BASE_URL, "pát")

    assert repr(asyncio.run(go())) == f"AdoClient(base_url={BASE_URL!r})"


@pytest.mark.parametrize(
    "value, expected",
    [("abc", True), ("", True), ("á", True), ("a\ud800", False), (None, False), (3, False)],
)
def test_is_utf8_text(value, expected):
    assert is_utf8_text(value) is expected


def _json_response(status: int, content: bytes):
    def handler(request):
        return httpx.Response(status, content=content, headers={"Content-Type": "application/json"})

    return handler


def _deep_json(depth: int) -> bytes:
    return ("[" * depth + "]" * depth).encode()


def test_json_nested_beyond_the_decoder_limit_is_unexpected_response():
    assert str(_ado_error(_json_response(200, _deep_json(5000)))) == UNEXPECTED_RESPONSE


def test_error_body_nested_beyond_the_decoder_limit_keeps_the_status_message():
    error = _ado_error(_json_response(500, _deep_json(5000)))
    assert str(error) == "Azure DevOps returned an error (HTTP 500)."


def test_non_encodable_error_message_is_dropped():
    error = _ado_error(_json_response(500, b'{"message": "bad \\ud800 thing"}'))
    assert str(error) == "Azure DevOps returned an error (HTTP 500)."


def _nested_area_nodes(depth: int):
    """A handler serving the project and an Area root with `depth` nested levels
    (raw JSON, since json.dumps itself cannot nest that deep)."""
    node = '{"name":"x","path":"\\\\P\\\\Area\\\\x"}'
    for _ in range(depth):
        node = '{"name":"x","path":"\\\\P\\\\Area\\\\x","children":[' + node + "]}"
    area = node[:-1] + ',"structureType":"area"}'
    iteration = json.dumps(classification_nodes()["value"][1])
    nodes = ('{"value":[' + area + "," + iteration + "]}").encode()

    def handler(request):
        if "/_apis/projects/" in request.url.path:
            return httpx.Response(200, json={"id": PROJECT_ID, "name": PROJECT_NAME})
        return httpx.Response(200, content=nodes, headers={"Content-Type": "application/json"})

    return handler


def test_connect_tree_at_the_depth_bound_is_returned():
    result = _connect(_nested_area_nodes(MAX_TREE_DEPTH))
    depth, node = 0, result["areas"]
    while node["children"]:
        depth, node = depth + 1, node["children"][0]
    assert depth == MAX_TREE_DEPTH
    assert node["path"] == "P\\x"


@pytest.mark.parametrize("extra", [1, 800, 5000])  # 800 decodes fine but would recurse deeply
def test_connect_tree_deeper_than_the_bound_is_unexpected_response(extra):
    with pytest.raises(AdoError) as info:
        _connect(_nested_area_nodes(MAX_TREE_DEPTH + extra))
    assert str(info.value) == UNEXPECTED_RESPONSE


def test_connect_keeps_sibling_order_in_a_wide_tree():
    nodes = classification_nodes()
    nodes["value"][0]["children"] = [{"name": f"T{i}", "path": f"\\P\\Area\\T{i}"} for i in range(5)]
    result = _connect(FakeAdo(nodes=nodes))
    assert [c["name"] for c in result["areas"]["children"]] == ["T0", "T1", "T2", "T3", "T4"]


def _escaped_nodes(nodes: dict):
    """Serve `nodes` as ASCII JSON, so lone surrogates travel as `\\ud800`
    escapes (httpx's own `json=` would refuse to encode them)."""
    content = json.dumps(nodes).encode()

    def handler(request):
        if "/_apis/projects/" in request.url.path:
            return httpx.Response(200, json={"id": PROJECT_ID, "name": PROJECT_NAME})
        return httpx.Response(200, content=content, headers={"Content-Type": "application/json"})

    return handler


@pytest.mark.parametrize("field", ["name", "path"])
def test_connect_non_encodable_node_text_is_unexpected_response(field):
    nodes = classification_nodes()
    nodes["value"][0]["children"][0][field] = "Team \ud800"
    with pytest.raises(AdoError) as info:
        _connect(_escaped_nodes(nodes))
    assert str(info.value) == UNEXPECTED_RESPONSE


def test_connect_non_encodable_project_name_is_unexpected_response():
    content = f'{{"id": "{PROJECT_ID}", "name": "P\\ud800"}}'.encode()
    with pytest.raises(AdoError) as info:
        _connect(_json_response(200, content))
    assert str(info.value) == UNEXPECTED_RESPONSE


def test_connect_non_encodable_finish_date_is_blank():
    nodes = classification_nodes()
    nodes["value"][1]["children"][1]["attributes"] = {"finishDate": "2026\ud800"}
    result = _connect(_escaped_nodes(nodes))
    assert result["iterations"]["children"][1]["finishDate"] == ""
