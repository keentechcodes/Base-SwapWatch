/**
 * Room Page - Real-time swap monitoring with WebSocket connection to Worker
 * Replaces mock data with actual Worker API integration
 */

"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWebSocket } from "@/hooks/useWebSocket";
import { WS_URL, API_URL } from "@/lib/config";
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
  // Additional enriched data
  usdValue?: number;
  tokenInSymbol?: string;
  tokenOutSymbol?: string;
};

type Stats = {
  swaps: number;
  volume: number;
  wallets: number;
};

type RoomData = {
  code: string;
  wallets: string[];
  labels: Record<string, string>;
  createdAt: string;
};

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const room = String(params?.code || "");

  // Room data from Worker API
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [isLoadingRoom, setIsLoadingRoom] = useState(true);

  // Swap data
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [stats, setStats] = useState<Stats>({ swaps: 0, volume: 0, wallets: 0 });

  // Wallet management
  const [walletInput, setWalletInput] = useState("");
  const [walletLabelInput, setWalletLabelInput] = useState("");
  const [isAddingWallet, setIsAddingWallet] = useState(false);

  // Modals & views
  const [openModal, setOpenModal] = useState<null | "wallets" | "volume" | "swaps">(null);
  const [volumeView, setVolumeView] = useState<"coins" | "wallets">("coins");
  const [swapsView, setSwapsView] = useState<"coins" | "wallets">("coins");

  // Presence tracking
  const [viewers, setViewers] = useState(1);

  // WebSocket connection to Worker
  const wsUrl = room ? `${WS_URL}/room/${room}/ws` : null;

  const {
    status: wsStatus,
    isConnected,
    send: wsSend,
    lastMessageTime
  } = useWebSocket(wsUrl, {
    retryOnError: true,
    maxRetries: 5,
    heartbeatInterval: 30000,
    onMessage: (message) => {
      console.log('[Room] Received message:', message.type);

      switch (message.type) {
        case 'swap':
          handleSwapReceived(message.data);
          break;

        case 'presence':
          setViewers(message.count || 1);
          break;

        case 'room_data':
          // Initial room state
          if (message.data) {
            setRoomData(message.data);
            setIsLoadingRoom(false);
          }
          break;

        case 'wallet_added':
          // Wallet was added successfully
          if (message.wallet) {
            setRoomData(prev => prev ? {
              ...prev,
              wallets: [...prev.wallets, message.wallet],
              labels: message.label ? {
                ...prev.labels,
                [message.wallet]: message.label
              } : prev.labels
            } : null);
          }
          break;

        case 'wallet_removed':
          // Wallet was removed
          if (message.wallet) {
            setRoomData(prev => prev ? {
              ...prev,
              wallets: prev.wallets.filter(w => w !== message.wallet),
              labels: Object.fromEntries(
                Object.entries(prev.labels).filter(([k]) => k !== message.wallet)
              )
            } : null);
          }
          break;

        case 'error':
          console.error('[Room] Error from server:', message.message);
          break;

        default:
          console.log('[Room] Unknown message type:', message.type);
      }
    },
    onOpen: () => {
      console.log('[Room] WebSocket connected');
      // Request initial room data
      wsSend({ type: 'get_room_data' });
    },
    onClose: (event) => {
      console.log('[Room] WebSocket closed:', event.code, event.reason);
    },
    onError: (error) => {
      console.error('[Room] WebSocket error:', error);
    },
    onReconnect: (attempt) => {
      console.log(`[Room] Reconnecting (attempt ${attempt})...`);
    }
  });

  // Handle received swap
  const handleSwapReceived = useCallback((swap: Swap) => {
    setSwaps(prev => {
      // Check for duplicate swap (by tx hash or id)
      const isDuplicate = prev.some(s => s.tx === swap.tx || s.id === swap.id);
      if (isDuplicate) {
        console.log('[Room] Duplicate swap received, skipping:', swap.tx);
        return prev;
      }

      // Add new swap to the beginning, keep last 200
      return [swap, ...prev].slice(0, 200);
    });

    setStats(prev => ({
      swaps: prev.swaps + 1,
      volume: prev.volume + (swap.usdValue || 0),
      wallets: prev.wallets // Will be updated from room data
    }));
  }, []);

  // Load room data on mount
  useEffect(() => {
    if (!room) return;

    const loadRoom = async () => {
      try {
        setIsLoadingRoom(true);
        const response = await fetch(`${API_URL}/rooms/${room}`);

        if (!response.ok) {
          if (response.status === 404) {
            // Room doesn't exist, create it
            await createRoom();
          } else {
            throw new Error('Failed to load room');
          }
          return;
        }

        const data = await response.json();
        setRoomData(data);

        // Load swap history
        try {
          const swapsResponse = await fetch(`${API_URL}/rooms/${room}/swaps`);
          if (swapsResponse.ok) {
            const swapsData = await swapsResponse.json();
            if (Array.isArray(swapsData) && swapsData.length > 0) {
              console.log('[Room] Loaded', swapsData.length, 'historical swaps');
              setSwaps(swapsData);

              // Calculate initial stats from historical data
              const totalVolume = swapsData.reduce((sum, swap) => sum + (swap.usdValue || 0), 0);
              setStats(prev => ({
                ...prev,
                swaps: swapsData.length,
                volume: totalVolume
              }));
            }
          }
        } catch (error) {
          console.warn('[Room] Could not load swap history:', error);
          // Non-critical error, continue without historical swaps
        }
      } catch (error) {
        console.error('[Room] Error loading room:', error);
      } finally {
        setIsLoadingRoom(false);
      }
    };

    loadRoom();
  }, [room]);

  // Create room if it doesn't exist
  const createRoom = async () => {
    try {
      const response = await fetch(`${API_URL}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: room })
      });

      if (!response.ok) {
        throw new Error('Failed to create room');
      }

      const data = await response.json();
      setRoomData(data);
      setIsLoadingRoom(false);
    } catch (error) {
      console.error('[Room] Error creating room:', error);
      setIsLoadingRoom(false);
    }
  };

  // Add wallet to room
  const handleAddWallet = async () => {
    if (!walletInput.trim() || !room) return;

    const wallet = walletInput.trim().toLowerCase();

    // Validate ethereum address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      alert('Invalid Ethereum address format');
      return;
    }

    if (roomData?.wallets.includes(wallet)) {
      alert('Wallet already tracked in this room');
      return;
    }

    try {
      setIsAddingWallet(true);

      const response = await fetch(`${API_URL}/rooms/${room}/wallets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet,
          label: walletLabelInput.trim() || undefined
        })
      });

      if (!response.ok) {
        throw new Error('Failed to add wallet');
      }

      // WebSocket will receive wallet_added message
      setWalletInput("");
      setWalletLabelInput("");
    } catch (error) {
      console.error('[Room] Error adding wallet:', error);
      alert('Failed to add wallet');
    } finally {
      setIsAddingWallet(false);
    }
  };

  // Remove wallet from room
  const handleRemoveWallet = async (wallet: string) => {
    if (!room) return;

    try {
      const response = await fetch(`${API_URL}/rooms/${room}/wallets/${wallet}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to remove wallet');
      }

      // WebSocket will receive wallet_removed message
    } catch (error) {
      console.error('[Room] Error removing wallet:', error);
      alert('Failed to remove wallet');
    }
  };

  // Copy room link
  const handleCopyLink = () => {
    const url = `${window.location.origin}/room/${room}`;
    navigator.clipboard.writeText(url);
    alert('Room link copied to clipboard!');
  };

  // Calculate stats from room data
  useEffect(() => {
    if (!roomData) return;

    setStats(prev => ({
      ...prev,
      wallets: roomData.wallets.length
    }));
  }, [roomData]);

  // Connection status indicator
  const connectionStatus = useMemo(() => {
    switch (wsStatus) {
      case 'connected':
        return { color: 'bg-green-500', text: 'Connected' };
      case 'connecting':
      case 'reconnecting':
        return { color: 'bg-yellow-500', text: 'Connecting...' };
      case 'error':
        return { color: 'bg-red-500', text: 'Error' };
      default:
        return { color: 'bg-gray-500', text: 'Disconnected' };
    }
  }, [wsStatus]);

  if (isLoadingRoom) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Loading room...</h2>
          <p className="text-muted-foreground">Connecting to {room}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold">Room {room.toUpperCase()}</h1>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${connectionStatus.color}`} />
                <span className="text-sm text-muted-foreground">{connectionStatus.text}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {viewers} {viewers === 1 ? 'viewer' : 'viewers'}
              </div>
              {lastMessageTime && (
                <div className="text-sm text-muted-foreground">
                  Last update: {new Date(lastMessageTime).toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopyLink}
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              Copy Link
            </button>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 border rounded hover:bg-accent"
            >
              Exit
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div
            className="bg-card p-6 rounded-lg border cursor-pointer hover:bg-accent"
            onClick={() => setOpenModal('swaps')}
          >
            <div className="text-4xl font-bold">{stats.swaps}</div>
            <div className="text-muted-foreground">Total Swaps</div>
          </div>
          <div
            className="bg-card p-6 rounded-lg border cursor-pointer hover:bg-accent"
            onClick={() => setOpenModal('volume')}
          >
            <div className="text-4xl font-bold">${stats.volume.toLocaleString()}</div>
            <div className="text-muted-foreground">Est. Volume (USD)</div>
          </div>
          <div
            className="bg-card p-6 rounded-lg border cursor-pointer hover:bg-accent"
            onClick={() => setOpenModal('wallets')}
          >
            <div className="text-4xl font-bold">{stats.wallets}</div>
            <div className="text-muted-foreground">Wallets Observed</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Swap Feed */}
        <div className="lg:col-span-2 bg-card rounded-lg border p-6">
          <h2 className="text-xl font-bold mb-4">Live Swap Feed</h2>
          {swaps.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              Waiting for swaps...
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {swaps.map((swap) => (
                <div key={swap.id} className="flex items-center justify-between p-3 bg-accent rounded">
                  <div className="flex-1">
                    <div className="font-mono text-sm">
                      {swap.amountIn.toFixed(4)} {swap.tokenInSymbol || swap.from} → {swap.amountOut.toFixed(4)} {swap.tokenOutSymbol || swap.to}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {swap.wallet.slice(0, 6)}...{swap.wallet.slice(-4)}
                    </div>
                  </div>
                  {swap.usdValue && (
                    <div className="text-right">
                      <div className="font-semibold">${swap.usdValue.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(swap.ts).toLocaleTimeString()}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Wallet Tracking */}
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-xl font-bold mb-4">Wallet Tracking</h2>

          {/* Add Wallet Form */}
          <div className="space-y-3 mb-6">
            <input
              type="text"
              value={walletInput}
              onChange={(e) => setWalletInput(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 bg-background border rounded"
              disabled={isAddingWallet}
            />
            <input
              type="text"
              value={walletLabelInput}
              onChange={(e) => setWalletLabelInput(e.target.value)}
              placeholder="e.g. Treasury, My hot wallet"
              className="w-full px-3 py-2 bg-background border rounded"
              disabled={isAddingWallet}
            />
            <button
              onClick={handleAddWallet}
              disabled={isAddingWallet || !walletInput.trim()}
              className="w-full px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {isAddingWallet ? 'Adding...' : 'Add'}
            </button>
          </div>

          {/* Tracked Wallets */}
          <div className="space-y-2">
            {roomData?.wallets.map((wallet) => (
              <div key={wallet} className="flex items-center justify-between p-2 bg-accent rounded">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {roomData.labels[wallet] || `${wallet.slice(0, 6)}...${wallet.slice(-4)}`}
                  </div>
                  {roomData.labels[wallet] && (
                    <div className="text-xs text-muted-foreground font-mono">
                      {wallet.slice(0, 6)}...{wallet.slice(-4)}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveWallet(wallet)}
                  className="ml-2 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 rounded"
                >
                  remove
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modals (simplified for now) */}
      <Dialog open={openModal !== null} onOpenChange={() => setOpenModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {openModal === 'swaps' && 'All Swaps'}
              {openModal === 'volume' && 'Volume Breakdown'}
              {openModal === 'wallets' && 'Tracked Wallets'}
            </DialogTitle>
            <DialogDescription>
              Details view - to be implemented
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
