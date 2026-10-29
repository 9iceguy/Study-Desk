from contextlib import asynccontextmanager
import fastapi
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from apps.calculator.route import router as calculator_router
from apps.study.route import router as study_router
from constants import SERVER_URL, PORT, ENV

@asynccontextmanager
async def lifespan(app: fastapi.FastAPI):
    yield

app = fastapi.FastAPI(lifespan=lifespan)


app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get('/')
async def root():
    return {"message": "Server is running"}

app.include_router(calculator_router, prefix="/calculate", tags=["calculate"])
app.include_router(study_router, prefix="/study", tags=["study"])


if __name__ == "__main__":
    uvicorn.run("main:app", host=SERVER_URL, port=int(PORT), reload=(ENV == "dev")) 