type Props = {
  title: string;
  message: string;
  error?: string;
};

export function SetupRequiredCard({ title, message, error }: Props) {
  return (
    <section className="card">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted">{message}</p>
      {error ? <p className="mt-2 text-xs text-muted">Error: {error}</p> : null}
    </section>
  );
}
