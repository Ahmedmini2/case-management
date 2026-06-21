type ActivityItem = {
  id: string;
  description: string;
  createdAt: string;
  user: { name: string | null } | null;
};

export function CaseTimeline({ items }: { items: ActivityItem[] }) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-md border p-3">
          <p className="text-sm font-medium break-words">{item.description}</p>
          <p className="text-xs text-muted-foreground break-words">
            {item.user?.name ?? "System"} - {new Date(item.createdAt).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
