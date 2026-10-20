import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.routes import router

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(title="CM Estimations Hub API")

    @app.exception_handler(RequestValidationError)
    async def request_validation_error(request: Request, exc: RequestValidationError):
        # Keep every 422 in the same `{errors: [str]}` shape the client renders.
        errors = [
            f"Invalid request: {'.'.join(str(part) for part in err['loc'])}: {err['msg']}"
            for err in exc.errors()
        ]
        return JSONResponse(status_code=422, content={"errors": errors})

    @app.exception_handler(Exception)
    async def unhandled_exception(request: Request, _: Exception):
        # Anything not handled elsewhere: log the traceback server-side and
        # return a generic 500 in the same `{errors: [str]}` shape, without
        # leaking internals to the client.
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"errors": ["An unexpected error occurred. Please review your input historical data."]},
        )

    app.include_router(router, prefix="/api")
    return app


app = create_app()
