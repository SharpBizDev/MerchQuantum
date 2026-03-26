export default function HomePage() {
  return (
    <main style={{ minHeight: "100vh", padding: "32px", fontFamily: "Arial, sans-serif", background: "#0f172a", color: "#ffffff" }}>
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: "40px", fontWeight: 700 }}>
          <span style={{ color: "#8b5cf6" }}>Merch</span>
          <span>Quantum</span>
        </h1>
        <p style={{ marginTop: "8px", fontSize: "16px", color: "#cbd5e1" }}>
          Bulk product creation, <span style={{ color: "#8b5cf6", fontWeight: 600 }}>simplified</span>
        </p>
        <p style={{ marginTop: "24px", fontSize: "14px", color: "#94a3b8" }}>
          Base Next.js page is installed. Full app UI goes in next.
        </p>
      </div>
    </main>
  );
}
