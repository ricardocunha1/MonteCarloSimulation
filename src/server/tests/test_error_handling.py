from fastapi.testclient import TestClient

from app.main import create_app


def test_unhandled_exception_returns_generic_500():
    app = create_app()

    @app.get("/api/boom")
    async def boom():
        raise RuntimeError("secret internal detail")

    # Starlette re-raises after the handler responds; disable that to see the response.
    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/api/boom")

    assert response.status_code == 500
    assert response.json() == {
        "errors": ["An unexpected error occurred. Please review your input historical data."]
    }
    assert "secret" not in response.text


def test_app_title_is_cm_estimations_hub():
    assert create_app().title == "Planning Hub API"
