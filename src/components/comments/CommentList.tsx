type CommentItem = {
  id: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  author: { name: string | null; email: string | null };
};

export function CommentList({ comments }: { comments: CommentItem[] }) {
  if (!comments.length) {
    return <p className="text-sm text-muted-foreground">No comments yet.</p>;
  }

  return (
    <div className="space-y-3">
      {comments.map((comment) => (
        <div key={comment.id} className="rounded-md border p-3">
          <p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {comment.author.name ?? comment.author.email ?? "Unknown"} -{" "}
            {new Date(comment.createdAt).toLocaleString()}
            {comment.isInternal ? " - Internal" : ""}
          </p>
        </div>
      ))}
    </div>
  );
}
