"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ManifestScreen } from "../../components/manifest-screen";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { useParserQuery } from "../../lib/hooks/api/queries/parsers";
import { ApiError } from "../../lib/client";

export default function ParserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = use(params);
  const id = decodeURIComponent(rawId);
  const router = useRouter();
  // refetchInterval inside the query auto-polls while status === "running",
  // so no manual setInterval here.
  const { data: parser, isLoading, error } = useParserQuery(id);

  if (isLoading && !parser) {
    return <EmptyState title="Loading parser…" body={`parser_id ${id}`} />;
  }

  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState
        title="Parser not found"
        body={`parser_id ${id} — 404`}
        cta={
          <Button variant="primary" onClick={() => router.push("/parsers")}>
            Browse parsers
          </Button>
        }
      />
    );
  }

  if (!parser) {
    return (
      <EmptyState
        title="Couldn't load parser"
        body={error instanceof Error ? error.message : `parser_id ${id}`}
      />
    );
  }

  return <ManifestScreen parser={parser} />;
}
