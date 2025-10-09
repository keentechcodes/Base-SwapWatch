"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Swap = {
  id: string;
  ts: number;
  from: string;
  to: string;
  amountIn: number;
  amountOut: number;
  wallet: string;
  tx: string;
};

type Stats = {
  swaps: number;
  volume: number; // sum of amountIn in USD eq (simulated)
  wallets: number;
};

function useRoomChannel(room: string) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    const ch = new BroadcastChannel(`swapwatch:${room}`);
    channelRef.current = ch;
    return () => ch.close();
  }, [room]);
  return channelRef;
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomAddress() {
  const hex = [...crypto.getRandomValues(new Uint8Array(20))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return "0x" + hex;
}

const TOKENS = [
  { sym: "WETH", addr: "0x4200...ETH" },
  { sym: "USDC", addr: "0x4200...USDC" },
  { sym: "DEGEN", addr: "0x4200...DEGEN" },
  { sym: "cbETH", addr: "0x4200...CBETH" },
  { sym: "AERO", addr: "0x4200...AERO" },
];

// Simple simulated USD prices & market caps for demo purposes
const USD_PRICE: Record<string, number> = {
  WETH: 2500,
  USDC: 1,
  DEGEN: 0.02,
  cbETH: 2500,
  AERO: 0.5,
};
const MARKET_CAP: Record<string, number> = {
  // totally mocked market caps
  DEGEN: 350_000_000,
  cbETH: 4_500_000_000,
  AERO: 120_000_000,
};
const EXCLUDE_CAP = new Set(["USDC", "WETH"]);
const usdForSwap = (s: { amountIn: number; from: string }) =>
  (USD_PRICE[s.from] || 1) * s.amountIn;

function makeSwap(): Swap {
  const from = randomFrom(TOKENS);
  let to = randomFrom(TOKENS);
  while (to.sym === from.sym) to = randomFrom(TOKENS);
  const amountIn = +(Math.random() * 5 + 0.01).toFixed(4);
  const amountOut = +(amountIn * (0.9 + Math.random() * 0.2)).toFixed(4);
  return {
    id: crypto.randomUUID(),
    ts: Date.now(),
    from: from.sym,
    to: to.sym,
    amountIn,
    amountOut,
    wallet: randomAddress(),
    tx: `0x${crypto.getRandomValues(new Uint8Array(16))
      .reduce((a, b) => a + b.toString(16).padStart(2, "0"), "")}`,
  };
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const room = String(params?.code || "");
  const isDemo = room.toUpperCase() === "DEMO";

  const [tracked, setTracked] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`swapwatch:tracked:${room}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  // Wallet labels per address (optional names)
  const [labels, setLabels] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(`swapwatch:labels:${room}`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [stats, setStats] = useState<Stats>({ swaps: 0, volume: 0, wallets: 0 });
  const [walletInput, setWalletInput] = useState("");
  const [walletLabelInput, setWalletLabelInput] = useState("");

  // Modals & views
  const [openModal, setOpenModal] = useState<null | "wallets" | "volume" | "swaps">(null);
  const [volumeView, setVolumeView] = useState<"coins" | "wallets">("coins");
  const [swapsView, setSwapsView] = useState<"coins" | "wallets">("coins");

  // Presence: live viewers in room
  const [viewers, setViewers] = useState(1);
  const presenceRef = useRef<Map<string, number>>(new Map());
  const myIdRef = useRef<string>("");

  const channelRef = useRoomChannel(room);

  // Seed demo data immediately for /room/DEMO
  useEffect(() => {
    if (!isDemo) return;
    const demoSwaps = Array.from({ length: 25 }, () => makeSwap());
    const walletsSet = new Set(demoSwaps.map((s) => s.wallet));
    const volumeSum = demoSwaps.reduce((acc, s) => acc + usdForSwap(s), 0);
    setSwaps(demoSwaps);
    setStats({ swaps: demoSwaps.length, volume: +volumeSum.toFixed(2), wallets: walletsSet.size });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo]);

  // Persist tracked wallets per room
  useEffect(() => {
    try {
      localStorage.setItem(`swapwatch:tracked:${room}`, JSON.stringify(tracked));
    } catch {}
  }, [tracked, room]);

  // Persist wallet labels per room
  useEffect(() => {
    try {
      localStorage.setItem(`swapwatch:labels:${room}`, JSON.stringify(labels));
    } catch {}
  }, [labels, room]);

  // Listen & emit swaps across tabs
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "swap") {
        const s: Swap = e.data.swap;
        setSwaps((cur) => [s, ...cur].slice(0, 200));
        setStats((st) => ({
          swaps: st.swaps + 1,
          volume: +(st.volume + usdForSwap(s)).toFixed(2),
          wallets: new Set([...(tracked || []), s.wallet]).size,
        }));
      }
      // Presence handling
      if (e.data?.type?.startsWith("presence:")) {
        const now = Date.now();
        const { id } = e.data as { id: string };
        if (!id) return;
        presenceRef.current.set(id, now);
        // Reply with heartbeat when someone announces
        if (e.data.type === "presence:announce" && myIdRef.current) {
          ch.postMessage({ type: "presence:heartbeat", id: myIdRef.current });
        }
        // Recompute viewers after updates
        const cutoff = now - 15_000; // active within last 15s
        let count = 0;
        presenceRef.current.forEach((ts) => {
          if (ts >= cutoff) count++;
        });
        setViewers(Math.max(1, count));
      }
    };
    ch.addEventListener("message", onMessage);
    return () => ch.removeEventListener("message", onMessage);
  }, [channelRef, tracked]);

  // Produce mock data locally and broadcast
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const timer = setInterval(() => {
      const s = makeSwap();
      ch.postMessage({ type: "swap", swap: s });
    }, 2200 + Math.random() * 1800);
    return () => clearInterval(timer);
  }, [channelRef]);

  // Presence: announce, heartbeat, and cleanup
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch) return;
    // Initialize my ID per tab
    const existing = sessionStorage.getItem("swapwatch:presence:id");
    const myId = existing || crypto.randomUUID();
    sessionStorage.setItem("swapwatch:presence:id", myId);
    myIdRef.current = myId;
    // Add self immediately and announce
    presenceRef.current.set(myId, Date.now());
    ch.postMessage({ type: "presence:announce", id: myId });

    const heartbeat = setInterval(() => {
      presenceRef.current.set(myId, Date.now());
      ch.postMessage({ type: "presence:heartbeat", id: myId });
    }, 7_000);

    const prune = setInterval(() => {
      const now = Date.now();
      const cutoff = now - 15_000;
      // Drop stale
      for (const [id, ts] of presenceRef.current) {
        if (ts < cutoff) presenceRef.current.delete(id);
      }
      // Update UI count
      setViewers(Math.max(1, presenceRef.current.size));
    }, 5_000);

    const onBeforeUnload = () => {
      try {
        ch.postMessage({ type: "presence:leave", id: myId });
      } catch {}
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      clearInterval(heartbeat);
      clearInterval(prune);
      window.removeEventListener("beforeunload", onBeforeUnload);
      try {
        ch.postMessage({ type: "presence:leave", id: myId });
      } catch {}
    };
  }, [channelRef]);

  // Derived analytics (24h window)
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const recentSwaps = useMemo(() => swaps.filter((s) => s.ts >= dayAgo), [swaps, dayAgo]);

  const observedWallets = useMemo(() => {
    const map = new Map<string, { address: string; label?: string; swaps: number; volume: number }>();
    for (const s of recentSwaps) {
      const cur = map.get(s.wallet) || { address: s.wallet, label: labels[s.wallet], swaps: 0, volume: 0 };
      cur.swaps += 1;
      cur.volume += usdForSwap(s);
      map.set(s.wallet, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.volume - a.volume);
  }, [recentSwaps, labels]);

  const tokenVolumes = useMemo(() => {
    const map = new Map<string, { token: string; volume: number; swaps: number }>();
    for (const s of recentSwaps) {
      const cur = map.get(s.from) || { token: s.from, volume: 0, swaps: 0 };
      cur.volume += usdForSwap(s);
      cur.swaps += 1;
      map.set(s.from, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.volume - a.volume);
  }, [recentSwaps]);

  const tokenSwapCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of recentSwaps) {
      map.set(s.from, (map.get(s.from) || 0) + 1);
      map.set(s.to, (map.get(s.to) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([token, count]) => ({ token, count }))
      .sort((a, b) => b.count - a.count);
  }, [recentSwaps]);

  const filteredSwaps = useMemo(() => {
    if (!tracked.length) return swaps;
    const set = new Set(tracked.map((w) => w.toLowerCase()));
    return swaps.filter((s) => set.has(s.wallet.toLowerCase()));
  }, [swaps, tracked]);

  const addWallet = () => {
    const w = walletInput.trim();
    if (!w) return;
    setTracked((prev) => Array.from(new Set([...(prev || []), w])));
    if (walletLabelInput.trim()) {
      setLabels((prev) => ({ ...prev, [w]: walletLabelInput.trim() }));
    }
    setWalletInput("");
    setWalletLabelInput("");
  };

  const removeWallet = (w: string) => {
    setTracked((prev) => (prev || []).filter((x) => x !== w));
    setLabels((prev) => {
      const next = { ...prev };
      delete next[w];
      return next;
    });
  };

  return (
    <main className="min-h-screen w-full px-3 py-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-sm bg-[var(--primary)]/20 grid place-items-center border border-[var(--primary)] text-[var(--primary-foreground)]">SW</div>
          <div>
            <div className="text-sm text-[var(--muted-foreground)]">Room</div>
            <div className="font-semibold tracking-wider flex items-center gap-2">
              {room}
              <span className="text-[10px] rounded-sm border border-[var(--border)] bg-[var(--secondary)]/50 px-1.5 py-0.5 text-[var(--muted-foreground)]">
                {viewers} watching
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/")}
            className="rounded-md border border-[var(--border)] bg-[var(--secondary)] px-3 py-1.5 text-xs text-[var(--secondary-foreground)] hover:border-[var(--primary)]/50"
          >
            Exit
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(window.location.href)}
            className="rounded-md border border-[var(--primary)] bg-[var(--primary)]/10 px-3 py-1.5 text-xs text-[var(--primary-foreground)] hover:bg-[var(--primary)]/20"
          >
            Copy Link
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Stats */}
        <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div
            role="button"
            onClick={() => setOpenModal("swaps")}
            className="rounded-md border border-[var(--border)] bg-[var(--card)] p-4 cursor-pointer hover:border-[var(--primary)]/50 hover:bg-[var(--secondary)]/40 transition-colors"
          >
            <div className="text-xs text-[var(--muted-foreground)]">Total Swaps</div>
            <div className="mt-1 text-2xl font-bold">{stats.swaps}</div>
          </div>
          <div
            role="button"
            onClick={() => setOpenModal("volume")}
            className="rounded-md border border-[var(--border)] bg-[var(--card)] p-4 cursor-pointer hover:border-[var(--primary)]/50 hover:bg-[var(--secondary)]/40 transition-colors"
          >
            <div className="text-xs text-[var(--muted-foreground)]">Est. Volume (USD)</div>
            <div className="mt-1 text-2xl font-bold">${stats.volume.toLocaleString()}</div>
          </div>
          <div
            role="button"
            onClick={() => setOpenModal("wallets")}
            className="rounded-md border border-[var(--border)] bg-[var(--card)] p-4 cursor-pointer hover:border-[var(--primary)]/50 hover:bg-[var(--secondary)]/40 transition-colors"
          >
            <div className="text-xs text-[var(--muted-foreground)]">Wallets Observed</div>
            <div className="mt-1 text-2xl font-bold">{stats.wallets}</div>
          </div>
        </div>

        {/* Live feed */}
        <section className="lg:col-span-2 rounded-md border border-[var(--border)] bg-[var(--card)] overflow-hidden">
          <header className="border-b border-[var(--border)] p-3 text-sm text-[var(--muted-foreground)]">
            Live Swap Feed
          </header>
          <ul className="max-h-[60vh] overflow-auto divide-y divide-[var(--border)]">
            {filteredSwaps.length === 0 && (
              <li className="p-4 text-xs text-[var(--muted-foreground)]">Waiting for swaps…</li>
            )}
            {filteredSwaps.map((s) => (
              <li key={s.id} className="p-3 hover:bg-[var(--secondary)]/40">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="text-[var(--muted-foreground)]">{new Date(s.ts).toLocaleTimeString()}</span>
                  <span className="px-1.5 py-0.5 rounded border border-[var(--primary)]/60 bg-[var(--primary)]/10 text-[var(--primary-foreground)] text-[11px]">
                    {s.from} → {s.to}
                  </span>
                  <span>
                    {s.amountIn} {s.from} → {s.amountOut} {s.to}
                  </span>
                  {/* Market cap badge for non-USDC/WETH token at swap time (mocked) */}
                  {(() => {
                    const token = !EXCLUDE_CAP.has(s.from) ? s.from : !EXCLUDE_CAP.has(s.to) ? s.to : null;
                    if (!token) return null;
                    const cap = MARKET_CAP[token];
                    if (!cap) return null;
                    return (
                      <span className="ml-1 inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--secondary)]/50 px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                        MCap: ${cap.toLocaleString()}
                      </span>
                    );
                  })()}
                </div>
                <div className="mt-1 text-xs text-[var(--muted-foreground)] break-all">
                  <span className="mr-3">
                    <span className="opacity-80 mr-1">Wallet:</span>
                    {labels[s.wallet] ? (
                      <>
                        <span className="mr-1 rounded-sm border border-[var(--border)] bg-[var(--secondary)]/50 px-1 py-0.5 text-[10px] text-[var(--secondary-foreground)]">{labels[s.wallet]}</span>
                        <span className="opacity-70">{s.wallet}</span>
                      </>
                    ) : (
                      s.wallet
                    )}
                  </span>
                  <a
                    className="underline decoration-dotted underline-offset-4 hover:text-[var(--primary-foreground)]"
                    href={`https://basescan.org/tx/${s.tx}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Transaction
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Wallet tracking */}
        <aside className="lg:col-span-1 rounded-md border border-[var(--border)] bg-[var(--card)] overflow-hidden">
          <header className="border-b border-[var(--border)] p-3 text-sm text-[var(--muted-foreground)]">
            Wallet Tracking
          </header>
          <div className="p-3 space-y-3">
            <div>
              <label className="block text-xs text-[var(--muted-foreground)] mb-1">Add wallet address</label>
              <div className="flex gap-2">
                <input
                  value={walletInput}
                  onChange={(e) => setWalletInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addWallet()}
                  placeholder="0x…"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/70 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/60"
                />
                <button
                  onClick={addWallet}
                  className="rounded-md border border-[var(--primary)] bg-[var(--primary)]/10 px-3 text-sm text-[var(--primary-foreground)] hover:bg-[var(--primary)]/20"
                >
                  Add
                </button>
              </div>
              <div className="mt-2">
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">Optional name/label</label>
                <input
                  value={walletLabelInput}
                  onChange={(e) => setWalletLabelInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addWallet()}
                  placeholder="e.g. Treasury, My hot wallet"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/70 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/60"
                />
              </div>
            </div>
            <ul className="space-y-2">
              {tracked.length === 0 && (
                <li className="text-xs text-[var(--muted-foreground)]">No wallets added. All swaps shown.</li>
              )}
              {tracked.map((w) => (
                <li key={w} className="flex items-center justify-between gap-2 rounded border border-[var(--border)] bg-[var(--secondary)]/40 px-2 py-1">
                  <span className="text-xs break-all">
                    {labels[w] ? (
                      <>
                        <span className="mr-1 rounded-sm border border-[var(--border)] bg-[var(--secondary)]/60 px-1 py-0.5 text-[10px]">{labels[w]}</span>
                        <span className="opacity-70">{w}</span>
                      </>
                    ) : (
                      w
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    {/* Simple inline rename: click to set current label input */}
                    <button
                      onClick={() => {
                        setWalletLabelInput(labels[w] || "");
                        setWalletInput(w);
                      }}
                      className="text-[10px] rounded-sm border border-[var(--border)] px-2 py-0.5 hover:border-[var(--primary)] hover:text-[var(--primary-foreground)]"
                    >
                      rename
                    </button>
                    <button
                      onClick={() => removeWallet(w)}
                      className="text-[10px] rounded-sm border border-[var(--border)] px-2 py-0.5 hover:border-[var(--destructive)] hover:text-[var(--destructive)]"
                    >
                      remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {/* Wallets Observed Modal */}
      <Dialog open={openModal === "wallets"} onOpenChange={(o) => !o && setOpenModal(null)}>
        <DialogContent className="sm:max-w-lg bg-[var(--card)] text-[var(--card-foreground)] border border-[var(--border)]">
          <DialogHeader>
            <DialogTitle>Wallets Observed (24h)</DialogTitle>
            <DialogDescription className="text-[var(--muted-foreground)]">
              Unique wallets seen in the last 24 hours, sorted by estimated USD volume in.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto divide-y divide-[var(--border)] text-sm">
            {observedWallets.length === 0 && (
              <div className="p-3 text-[var(--muted-foreground)] text-xs">No wallets yet.</div>
            )}
            {observedWallets.slice(0, 50).map((w) => (
              <div key={w.address} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate">
                    {w.label ? (
                      <>
                        <span className="mr-1 rounded-sm border border-[var(--border)] bg-[var(--secondary)]/60 px-1 py-0.5 text-[10px]">{w.label}</span>
                        <span className="opacity-70">{w.address}</span>
                      </>
                    ) : (
                      w.address
                    )}
                  </div>
                  <div className="text-[10px] text-[var(--muted-foreground)]">{w.swaps} swaps</div>
                </div>
                <div className="font-mono">${w.volume.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Volume Modal */}
      <Dialog open={openModal === "volume"} onOpenChange={(o) => !o && setOpenModal(null)}>
        <DialogContent className="sm:max-w-lg bg-[var(--card)] text-[var(--card-foreground)] border border-[var(--border)]">
          <DialogHeader>
            <DialogTitle>Top Volume (24h)</DialogTitle>
            <DialogDescription className="text-[var(--muted-foreground)]">
              View by tokens or wallets.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 p-2">
            <button
              onClick={() => setVolumeView("coins")}
              className={`text-xs rounded-md border px-2 py-1 ${volumeView === "coins" ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary-foreground)]" : "border-[var(--border)] text-[var(--muted-foreground)]"}`}
            >
              Tokens
            </button>
            <button
              onClick={() => setVolumeView("wallets")}
              className={`text-xs rounded-md border px-2 py-1 ${volumeView === "wallets" ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary-foreground)]" : "border-[var(--border)] text-[var(--muted-foreground)]"}`}
            >
              Wallets
            </button>
          </div>
          <div className="max-h-[50vh] overflow-auto divide-y divide-[var(--border)] text-sm">
            {volumeView === "coins"
              ? tokenVolumes.slice(0, 50).map((t) => (
                  <div key={t.token} className="p-3 flex items-center justify-between">
                    <div>{t.token}</div>
                    <div className="font-mono">${t.volume.toFixed(2)}</div>
                  </div>
                ))
              : observedWallets.slice(0, 50).map((w) => (
                  <div key={w.address} className="p-3 flex items-center justify-between">
                    <div className="truncate">{w.label ? `${w.label} · ${w.address}` : w.address}</div>
                    <div className="font-mono">${w.volume.toFixed(2)}</div>
                  </div>
                ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Swaps Modal */}
      <Dialog open={openModal === "swaps"} onOpenChange={(o) => !o && setOpenModal(null)}>
        <DialogContent className="sm:max-w-lg bg-[var(--card)] text-[var(--card-foreground)] border border-[var(--border)]">
          <DialogHeader>
            <DialogTitle>Most Swapped (24h)</DialogTitle>
            <DialogDescription className="text-[var(--muted-foreground)]">
              See which tokens or wallets have the most swaps.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 p-2">
            <button
              onClick={() => setSwapsView("coins")}
              className={`text-xs rounded-md border px-2 py-1 ${swapsView === "coins" ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary-foreground)]" : "border-[var(--border)] text-[var(--muted-foreground)]"}`}
            >
              Tokens
            </button>
            <button
              onClick={() => setSwapsView("wallets")}
              className={`text-xs rounded-md border px-2 py-1 ${swapsView === "wallets" ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary-foreground)]" : "border-[var(--border)] text-[var(--muted-foreground)]"}`}
            >
              Wallets
            </button>
          </div>
          <div className="max-h-[50vh] overflow-auto divide-y divide-[var(--border)] text-sm">
            {swapsView === "coins"
              ? tokenSwapCounts.slice(0, 50).map((t) => (
                  <div key={t.token} className="p-3 flex items-center justify-between">
                    <div>{t.token}</div>
                    <div className="font-mono">{t.count}</div>
                  </div>
                ))
              : observedWallets
                  .slice()
                  .sort((a, b) => b.swaps - a.swaps)
                  .slice(0, 50)
                  .map((w) => (
                    <div key={w.address} className="p-3 flex items-center justify-between">
                      <div className="truncate">{w.label ? `${w.label} · ${w.address}` : w.address}</div>
                      <div className="font-mono">{w.swaps}</div>
                    </div>
                  ))}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}