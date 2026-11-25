"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="workspace"><div className="empty-state missing-state"><h1>Something went wrong</h1><button className="primary-button" onClick={reset}>Try again</button></div></main>;
}
