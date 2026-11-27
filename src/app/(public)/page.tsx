import { SITE_NAME } from "@/lib/site-config";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-4 py-16 sm:px-8">
      <h1 className="text-title font-semibold">{SITE_NAME}</h1>
      <p className="text-lg">
        The Robert Hunter Performance Archive is being rebuilt. This is the new
        app&apos;s skeleton; the archive itself is still at its current home.
      </p>
    </div>
  );
}
