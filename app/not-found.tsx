// Configure for Cloudflare Pages edge runtime
export const runtime = 'edge';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black text-green-500 font-mono">
      <div className="text-center space-y-4 p-8">
        <h1 className="text-6xl font-bold">404</h1>
        <p className="text-xl">Page not found</p>
        <a
          href="/"
          className="inline-block mt-4 px-6 py-2 border border-green-500 hover:bg-green-500 hover:text-black transition-colors"
        >
          Return to Home
        </a>
      </div>
    </div>
  );
}
