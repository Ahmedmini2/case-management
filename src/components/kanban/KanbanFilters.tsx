"use client";

import { Input } from "@/components/ui/input";

export function KanbanFilters({
  search,
  onSearchChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Input
        placeholder="Search cases..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full sm:max-w-sm"
      />
    </div>
  );
}
