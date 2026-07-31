type Props = {
  title: string;
  description?: string;
};

export function PageHeader({ title, description }: Props) {
  return (
    <section className="card">
      <h1 className="text-xl font-semibold">{title}</h1>
      {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
    </section>
  );
}
