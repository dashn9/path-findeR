from typing import Protocol

from aiobotocore.session import get_session


class CorpusStore(Protocol):
    async def put(self, job_id: str, index: int, url: str, html: str) -> None: ...
    async def get_all(self, job_id: str) -> list[tuple[str, str]]: ...
    async def delete(self, job_id: str) -> None: ...


class S3CorpusStore:
    def __init__(self, bucket: str, endpoint_url: str | None = None):
        self._bucket = bucket
        self._endpoint_url = endpoint_url
        self._session = get_session()

    def _client_kwargs(self) -> dict:
        kwargs: dict = {}
        if self._endpoint_url:
            kwargs["endpoint_url"] = self._endpoint_url
        return kwargs

    async def put(self, job_id: str, index: int, url: str, html: str) -> None:
        key = f"{job_id}/{index}.html"
        async with self._session.create_client("s3", **self._client_kwargs()) as client:
            await client.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=html.encode("utf-8"),
                Metadata={"url": url},
                ContentType="text/html",
            )

    async def get_all(self, job_id: str) -> list[tuple[str, str]]:
        prefix = f"{job_id}/"
        pages: list[tuple[str, str]] = []

        async with self._session.create_client("s3", **self._client_kwargs()) as client:
            paginator = client.get_paginator("list_objects_v2")
            async for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
                for obj in page.get("Contents", []):
                    key = obj["Key"]
                    head = await client.head_object(Bucket=self._bucket, Key=key)
                    url = head.get("Metadata", {}).get("url", "")
                    resp = await client.get_object(Bucket=self._bucket, Key=key)
                    body = await resp["Body"].read()
                    pages.append((url, body.decode("utf-8")))

        return pages

    async def delete(self, job_id: str) -> None:
        prefix = f"{job_id}/"
        async with self._session.create_client("s3", **self._client_kwargs()) as client:
            paginator = client.get_paginator("list_objects_v2")
            async for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
                for obj in page.get("Contents", []):
                    await client.delete_object(Bucket=self._bucket, Key=obj["Key"])
