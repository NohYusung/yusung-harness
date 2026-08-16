"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  parseErdDineugDocument,
  type ErdDineugParseResult,
} from "@/lib/erd-dineug";
import type { Erd } from "@/types/dashboard";

const ErdDineugCanvas = dynamic(
  () =>
    import("@/components/features/dashboard/ErdDineugCanvas").then(
      (module) => module.ErdDineugCanvas,
    ),
  {
    loading: () => (
      <div
        aria-label="Loading ERD preview"
        className="grid h-full min-h-72 place-items-center rounded-card border border-line bg-surface text-sm text-muted"
        role="status"
      >
        Loading ERD…
      </div>
    ),
    ssr: false,
  },
);

interface ErdDineugPreviewProps {
  record: Erd;
}

/** 저장된 Dineug 문서를 검증하고 읽기 전용 client canvas로 격리한다. */
export function ErdDineugPreview({ record }: ErdDineugPreviewProps) {
  const [validation, setValidation] = useState<{
    source: string | null;
    result: ErdDineugParseResult | null;
  }>({ source: record.document, result: null });

  useEffect(() => {
    let active = true;

    void parseErdDineugDocument(record.document).then((result) => {
      if (active) setValidation({ source: record.document, result });
    });

    return () => {
      active = false;
    };
  }, [record.document]);

  const parsedDocument =
    validation.source === record.document ? validation.result : null;
  if (parsedDocument === null) {
    return (
      <div
        aria-label={`Validating ${record.title} ERD preview`}
        className="grid h-full min-h-72 place-items-center rounded-card border border-line bg-surface text-sm text-muted"
        role="status"
      >
        Validating ERD…
      </div>
    );
  }

  if (!parsedDocument.data) {
    const errorTitle =
      record.document === null
        ? "Legacy ERD conversion required"
        : "Dineug ERD document invalid";

    return (
      <div
        aria-label={`${record.title} ERD preview error`}
        className="grid h-full min-h-72 place-items-center rounded-card border border-danger/30 bg-danger-soft p-8 text-center"
        role="alert"
      >
        <div className="max-w-md">
          <p className="m-0 text-sm font-semibold text-danger">
            {errorTitle}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted">
            {parsedDocument.error}
          </p>
          <p className="mt-2 font-mono text-xs text-subtle">
            ERD #{record.id}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ErdDineugCanvas
      document={parsedDocument.data}
      recordId={record.id}
      title={record.title}
    />
  );
}
