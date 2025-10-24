"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const runtime = 'edge';

function randomCode(len = 5) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [customCode, setCustomCode] = useState("");

  const asciiTop = useMemo(
    () => String.raw`
 $$$$$$\                                            
$$  __$$\                                           
$$ /  \__|$$\  $$\  $$\  $$$$$$\   $$$$$$\          
\$$$$$$\  $$ | $$ | $$ | \____$$\ $$  __$$\         
 \____$$\ $$ | $$ | $$ | $$$$$$$ |$$ /  $$ |        
$$\   $$ |$$ | $$ | $$ |$$  __$$ |$$ |  $$ |        
\$$$$$$  |\$$$$$\$$$$  |\$$$$$$$ |$$$$$$$  |        
 \______/  \_____\____/  \_______|$$  ____/         
                                  $$ |              
                                  $$ |              
                                  \__|              
`,
    []
  );

  const asciiBottom = useMemo(
    () => String.raw`
$$\      $$\            $$\               $$\       
$$ | $\  $$ |           $$ |              $$ |      
$$ |$$$\ $$ | $$$$$$\ $$$$$$\    $$$$$$$\ $$$$$$$\  
$$ $$ $$\$$ | \____$$\ _$$  _|  $$  _____|$$  __$$\ 
$$$$  _$$$$ | $$$$$$$ | $$ |    $$ /      $$ |  $$ |
$$$  / \$$$ |$$  __$$ | $$ |$$\ $$ |      $$ |  $$ |
$$  /   \$$ |\$$$$$$$ | \$$$$  |\$$$$$$$\ $$ |  $$ |
\__/     \__| \_______|  \____/  \_______|\__|  \__|
`,
    []
  );

  const asciiCombined = useMemo(() => `${asciiTop}\n${asciiBottom}`, [asciiTop, asciiBottom]);

  // Compute the widest line to size the block precisely in ch units
  // Note: Column calculations available but using fixed responsive sizing for better mobile UX
  // const topCols = useMemo(() => asciiTop.split("\n").reduce((m, l) => Math.max(m, l.length), 0), [asciiTop]);
  // const bottomCols = useMemo(() => asciiBottom.split("\n").reduce((m, l) => Math.max(m, l.length), 0), [asciiBottom]);
  // const maxCols = useMemo(() => Math.max(topCols, bottomCols), [topCols, bottomCols]);

  // Measure container to derive pixel-perfect font-size per column (desktop-first, minimal mobile)
  const [containerW, setContainerW] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const styles = window.getComputedStyle(el);
      const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      setContainerW(Math.max(0, el.clientWidth - padX));
    };
    update();
    const RO = (window as any).ResizeObserver;
    const ro = RO ? new RO(() => update()) : null;
    if (ro) ro.observe(el as Element);
    window.addEventListener("resize", update);
    // Re-measure once fonts finish loading to avoid mis-sizing with fallback font
    const fontsReady = (document as any).fonts?.ready as Promise<void> | undefined;
    const onLoad = () => update();
    if (fontsReady) fontsReady.then(() => update());
    window.addEventListener("load", onLoad);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("load", onLoad);
    };
  }, []);

  // Derive font-size: cap between 9px and 18px; width per column from inner content width
  // Note: fontPx calculation available but using displayFontPx for better mobile responsiveness
  const displayFontPx = useMemo(() => {
    // Slightly smaller on narrow mobile widths to prevent side clipping
    if (containerW === 0) return 16;
    if (containerW < 360) return 11;
    if (containerW < 420) return 12;
    if (containerW < 480) return 13;
    if (containerW < 560) return 14;
    return 16; // desktop/default
  }, [containerW]);

  const onCreate = () => {
    const wanted = customCode.trim().toUpperCase();
    const valid = /^[A-HJ-NP-Z2-9]{5}$/.test(wanted); // exclude confusing chars I,O,0,1
    const code = valid ? wanted : randomCode();
    router.push(`/room/${code}`);
  };

  const onJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    router.push(`/room/${code}`);
  };

  useEffect(() => {
    document.title = "SwapWatch — Create or Join a Room";
  }, []);

  return (
    <main className="min-h-screen w-full flex items-center justify-center px-4">
      <div className="w-full max-w-5xl">
        <div className="rounded-lg bg-transparent">
          <div className="p-4 sm:p-6">
            {/* ASCII block container with fixed boundaries */}
            <div
              ref={containerRef}
              className="w-full max-w-full p-3 sm:p-4">

              <div className="w-full flex justify-center">
                <pre
                  className="inline-block leading-[1] text-[var(--primary-foreground)] whitespace-pre select-text font-mono"
                  style={{
                    fontSize: `${displayFontPx}px`,
                    tabSize: 2 as unknown as string,
                    fontVariantLigatures: "none",
                    fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    letterSpacing: 0
                  }}
                  role="img"
                  aria-label="SwapWatch ASCII logo">

                  {asciiCombined}
                </pre>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-center gap-2">
              <p className="text-[10px] xs:text-[11px] sm:text-xs text-[var(--muted-foreground)] !whitespace-pre-wrap !whitespace-pre-line !whitespace-pre-line !whitespace-pre-line">{`Share the room code with friends to watch wallets and swaps together.\n*Currently Front End Demo* `}
                <wbr />
              </p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="w-full">
                <span className="block text-xs text-[var(--muted-foreground)] mb-2">Enter room code</span>
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && onJoin()}
                  placeholder="e.g. DEMO or 7Q2BX"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] caret-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/60 focus:border-[var(--primary)]/60 placeholder:text-[var(--muted-foreground)]/70" />

              </label>
              <div className="flex gap-2">
                <button
                  onClick={onJoin}
                  className="inline-flex items-center justify-center rounded-md border border-[var(--border)] bg-[var(--secondary)] px-4 py-2 text-sm text-[var(--secondary-foreground)] hover:bg-[var(--primary)]/10 hover:border-[var(--primary)]/50 transition-colors">

                  Join Room
                </button>
                <Dialog>
                  <DialogTrigger asChild>
                    <button
                      className="inline-flex items-center justify-center rounded-md border border-[var(--primary)] bg-[var(--primary)]/10 px-4 py-2 text-sm text-[var(--primary-foreground)] hover:bg-[var(--primary)]/20 transition-colors">
                      Create Room
                    </button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md bg-[var(--card)] text-[var(--card-foreground)] border border-[var(--border)]">
                    <DialogHeader>
                      <DialogTitle>Create Room</DialogTitle>
                      <DialogDescription className="text-[var(--muted-foreground)]">
                        Optionally pick a custom 5-character code. Leave empty to use a random code.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3">
                      <label className="w-full">
                        <span className="block text-xs text-[var(--muted-foreground)] mb-2">Custom code (5 chars, optional)</span>
                        <input
                          value={customCode}
                          onChange={(e) => setCustomCode(e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 5))}
                          placeholder="e.g. 7Q2BX"
                          className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] caret-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/60 focus:border-[var(--primary)]/60 placeholder:text-[var(--muted-foreground)]/70" />
                      </label>
                    </div>
                    <DialogFooter className="sm:justify-end">
                      <div className="flex w-full justify-end gap-2">
                        <button
                          onClick={onCreate}
                          className="inline-flex items-center justify-center rounded-md border border-[var(--primary)] bg-[var(--primary)]/10 px-4 py-2 text-sm text-[var(--primary-foreground)] hover:bg-[var(--primary)]/20 transition-colors">
                          Create
                        </button>
                      </div>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
          <div className="p-4 text-xs text-[var(--muted-foreground)]">
            <p className="!whitespace-pre-line !whitespace-pre-line !text-center !whitespace-pre-line !whitespace-pre-line !whitespace-pre-line">Built on Base with their CDP Webhooks

            </p>
          </div>
        </div>
      </div>
    </main>);


}