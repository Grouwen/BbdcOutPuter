import uvicorn

from app.config.app_config import appconfig

if __name__ == '__main__':
    uvicorn.run(app="app.api.app:app", host=appconfig.web.host, port=appconfig.web.port)