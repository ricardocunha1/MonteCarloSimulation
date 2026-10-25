"""Thin async wrapper over the Azure DevOps REST API (api-version 7.0) that maps
every failure to an `AdoError` carrying a user-facing message, per the "ADO
error mapping" in plans/release-plan-ado.md. Messages never contain the PAT
or any request header."""

import base64
import re
from collections.abc import Mapping
from typing import Any
from urllib.parse import urlsplit

import httpx

API_VERSION = "7.0"

PAT_REJECTED = (
    "Azure DevOps rejected the Personal Access Token (invalid, expired or "
    "missing the Work Items (Read) scope)."
)
UNEXPECTED_RESPONSE = "Azure DevOps returned an unexpected response."
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


class AdoError(Exception):
    """An Azure DevOps call failed. `status_code` is the HTTP status when the
    failure was an error response, so callers can remap specific codes (e.g.
    404 on the project)."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class AdoClient:
    """Calls `<base_url>/<path>` with the PAT as Basic auth.

    Args:
        http: the shared async client (closed by its owner, not here).
        base_url: `https://host/<org|collection>`, without a trailing slash.
        pat: the Personal Access Token, used for this client's requests only.
        timeout: per-request timeout in seconds; None keeps the client's own.

    Raises:
        AdoError: PAT_REJECTED, without any request, when the PAT can never be
            a valid token: not UTF-8 encodable (a lone surrogate) or containing
            control characters.
    """

    def __init__(self, http: httpx.AsyncClient, base_url: str, pat: str, timeout: float | None = None):
        if not is_utf8_text(pat) or _CONTROL_CHARS.search(pat):
            raise AdoError(PAT_REJECTED)
        self._http = http
        self._base_url = base_url.rstrip("/")
        self._host = urlsplit(self._base_url).hostname or self._base_url
        self._timeout = timeout
        token = base64.b64encode(f":{pat}".encode()).decode("ascii")
        self._headers = {"Authorization": f"Basic {token}", "Accept": "application/json"}

    def __repr__(self) -> str:
        return f"AdoClient(base_url={self._base_url!r})"

    async def get_json(self, path: str, params: Mapping[str, Any] | None = None) -> Any:
        """GET `<base_url>/<path>` and return the decoded JSON body.

        Raises:
            AdoError: for any transport failure or non-JSON / non-2xx response.
        """
        return await self._request("GET", path, params, None)

    async def post_json(self, path: str, params: Mapping[str, Any] | None = None, body: Any = None) -> Any:
        """POST `body` as JSON to `<base_url>/<path>` and return the decoded JSON body.

        Raises:
            AdoError: for any transport failure or non-JSON / non-2xx response.
        """
        return await self._request("POST", path, params, body)

    async def _request(self, method: str, path: str, params: Mapping[str, Any] | None, body: Any) -> Any:
        query = {**(params or {}), "api-version": API_VERSION}
        extra = {} if self._timeout is None else {"timeout": self._timeout}
        try:
            response = await self._http.request(
                method,
                f"{self._base_url}/{path.lstrip('/')}",
                params=query,
                headers=self._headers,
                json=body,
                follow_redirects=False,
                **extra,
            )
        except httpx.DecodingError as exc:  # e.g. a body that claims gzip but isn't
            raise AdoError(UNEXPECTED_RESPONSE) from exc
        except (httpx.HTTPError, httpx.InvalidURL, UnicodeError) as exc:
            # TransportError (incl. every TimeoutException) and any other
            # request-side failure, e.g. a URL httpx refuses to build.
            raise AdoError(f"Could not reach Azure DevOps at {self._host}.") from exc
        return _decode(response)


def _decode(response: httpx.Response) -> Any:
    """Map an ADO response to its JSON body or an AdoError.

    401/403, 3xx (sign-in redirects) and 203 (cloud's HTML sign-in page for a
    bad PAT) mean the PAT was rejected, as does a 2xx body that isn't JSON. A
    2xx body that claims to be JSON but can't be decoded is an unexpected
    response instead.
    """
    status = response.status_code
    if status in (401, 403, 203) or 300 <= status < 400:
        raise AdoError(PAT_REJECTED, status)
    if 200 <= status < 300:
        try:
            return response.json()
        except ValueError as exc:
            raise AdoError(UNEXPECTED_RESPONSE if _is_json(response) else PAT_REJECTED, status) from exc
        except RecursionError as exc:  # JSON nested deeper than the decoder allows
            raise AdoError(UNEXPECTED_RESPONSE, status) from exc

    message = f"Azure DevOps returned an error (HTTP {status})."
    try:
        payload = response.json()
    except (ValueError, RecursionError):
        payload = None
    if isinstance(payload, dict) and is_utf8_text(payload.get("message")) and payload["message"].strip():
        message = f"{message} {payload['message'].strip()}"
    raise AdoError(message, status)


def _is_json(response: httpx.Response) -> bool:
    """True when the Content-Type is `application/json` or a `+json` type."""
    media_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    return media_type == "application/json" or media_type.endswith("+json")


def is_utf8_text(value: Any) -> bool:
    """True for a str that can be UTF-8 encoded, i.e. safe to put in a JSON
    response or a header (a JSON `\\ud800` escape decodes to a lone surrogate,
    which cannot be)."""
    if not isinstance(value, str):
        return False
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        return False
    return True
