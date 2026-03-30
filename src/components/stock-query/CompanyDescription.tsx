"use client";

import { useState } from "react";

interface CompanyDescriptionProps {
  description: string;
}

export default function CompanyDescription({ description }: CompanyDescriptionProps) {
  const [expanded, setExpanded] = useState(false);
  if (!description) return null;

  const preview = description.slice(0, 220);
  const hasMore = description.length > 220;

  return (
    <div className="panel p-5">
      <p
        className="text-xs text-muted/80 leading-relaxed"
        style={{ fontFamily: "var(--font-nsc, 'Noto Serif SC', serif)" }}
      >
        {expanded ? description : preview}
        {hasMore && !expanded && "…"}
      </p>
      {hasMore && (
        <button
          className="mt-2 text-[10px] text-muted/50 hover:text-muted transition-colors font-trading tracking-wider"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "SHOW LESS ▲" : "SHOW MORE ▼"}
        </button>
      )}
    </div>
  );
}
