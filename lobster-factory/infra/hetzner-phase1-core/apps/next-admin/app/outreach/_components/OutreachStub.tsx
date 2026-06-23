// Shared placeholder for Cold Outreach Phase-1 pages whose full UI is not built yet.
// Server component (no client JS). Keeps each route's shell consistent + shows Next Best Action,
// matching the spec's UX principle that every page tells the operator what to do next (§F0).

export function OutreachStub({
  title,
  sub,
  next,
}: {
  title: string;
  sub: string;
  next: string[];
}) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <span className="card-label">{title}</span>
        <span className="card-badge badge-gray">Phase 1 建置中</span>
      </div>
      <p className="card-sub">{sub}</p>
      <div className="section-title">Next Best Action</div>
      <ul>
        {next.map((n, i) => (
          <li key={i} className="card-sub">
            {n}
          </li>
        ))}
      </ul>
    </div>
  );
}
