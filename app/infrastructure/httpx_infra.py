from httpx import AsyncClient

def init_httpx_infra()->AsyncClient:
    return AsyncClient(follow_redirects=True)


async def close_httpx_infra(httpx_infra:AsyncClient):
    await httpx_infra.aclose()