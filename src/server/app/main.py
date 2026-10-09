from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.routes import router


def create_app() -> FastAPI:
    app = FastAPI(title="Monte Carlo Simulator API")

    @app.exception_handler(RequestValidationError)
    async def request_validation_error(request: Request, exc: RequestValidationError):
        # Keep every 422 in the same `{errors: [str]}` shape the client renders.
        errors = [
            f"Invalid request: {'.'.join(str(part) for part in err['loc'])}: {err['msg']}"
            for err in exc.errors()
        ]
        return JSONResponse(status_code=422, content={"errors": errors})

    app.include_router(router, prefix="/api")
    return app


app = create_app()
