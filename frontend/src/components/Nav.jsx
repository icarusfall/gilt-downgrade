export default function Nav({ generatedAt }) {
  return (
    <nav className="nav">
      <div className="nav-brand">
        Sovereign rating events <span className="accent">·</span> yield response
      </div>
      {generatedAt && (
        <div className="nav-meta">data {new Date(generatedAt).toISOString().slice(0, 10)}</div>
      )}
    </nav>
  );
}
