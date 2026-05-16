"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ManifestScreen } from "../../components/manifest-screen";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { useStore } from "../../lib/store";

export default function ParserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { parsers } = useStore();
  const parser = parsers.find((p) => p._id === id);

  if (!parser) {
    return (
      <EmptyState
        title="Parser not found"
        body={`parser_id ${id} — 404`}
        cta={
          <Button variant="primary" onClick={() => router.push("/history")}>
            Browse history
          </Button>
        }
      />
    );
  }

  return <ManifestScreen parser={parser} />;
}
