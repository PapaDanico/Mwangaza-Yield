export default function OfflinePage() {
  return (
    <div className="card mt-6 space-y-3">
      <h1 className="text-2xl font-bold text-ink">You&apos;re offline.</h1>
      <p className="text-sm text-ink-muted">Here&apos;s what you can still do:</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
        <li>Portfolio view with cached holdings and payments</li>
        <li>Calculator with last available bond data</li>
        <li>Goals and ladder planning tools</li>
        <li>Price book and saved user prices</li>
        <li>Learning modules already opened on this device</li>
      </ul>
    </div>
  );
}
