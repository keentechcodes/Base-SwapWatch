/**
 * Demo data for the DEMO room
 * Showcases the watch party concept with realistic fake data
 */

export const DEMO_WALLETS = [
  { address: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e", label: "🐋 Whale Trader" },
  { address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", label: "🎯 Sniper Bot" },
  { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", label: "💎 Diamond Hands" },
  { address: "0x54e2acab04c89a3fe02852bf8dd69ee8f526bc75", label: "🔥 Degen Ape" },
];

export const DEMO_SWAPS = [
  {
    id: "0xdemo001",
    ts: Date.now() - 120000, // 2 minutes ago
    from: "USDC",
    to: "WETH",
    amountIn: 25000,
    amountOut: 12.5,
    wallet: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    tx: "0xdemo001tx",
    usdValue: 25000,
  },
  {
    id: "0xdemo002",
    ts: Date.now() - 300000, // 5 minutes ago
    from: "WETH",
    to: "BRETT",
    amountIn: 2.5,
    amountOut: 45000,
    wallet: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
    tx: "0xdemo002tx",
    usdValue: 5000,
  },
  {
    id: "0xdemo003",
    ts: Date.now() - 480000, // 8 minutes ago
    from: "USDC",
    to: "DEGEN",
    amountIn: 1000,
    amountOut: 125000,
    wallet: "0x54e2acab04c89a3fe02852bf8dd69ee8f526bc75",
    tx: "0xdemo003tx",
    usdValue: 1000,
  },
  {
    id: "0xdemo004",
    ts: Date.now() - 660000, // 11 minutes ago
    from: "BRETT",
    to: "USDC",
    amountIn: 75000,
    amountOut: 8500,
    wallet: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    tx: "0xdemo004tx",
    usdValue: 8500,
  },
  {
    id: "0xdemo005",
    ts: Date.now() - 900000, // 15 minutes ago
    from: "WETH",
    to: "USDC",
    amountIn: 5.2,
    amountOut: 10400,
    wallet: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    tx: "0xdemo005tx",
    usdValue: 10400,
  },
  {
    id: "0xdemo006",
    ts: Date.now() - 1200000, // 20 minutes ago
    from: "USDC",
    to: "TOSHI",
    amountIn: 3500,
    amountOut: 2500000,
    wallet: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
    tx: "0xdemo006tx",
    usdValue: 3500,
  },
  {
    id: "0xdemo007",
    ts: Date.now() - 1500000, // 25 minutes ago
    from: "DEGEN",
    to: "WETH",
    amountIn: 500000,
    amountOut: 2.1,
    wallet: "0x54e2acab04c89a3fe02852bf8dd69ee8f526bc75",
    tx: "0xdemo007tx",
    usdValue: 4200,
  },
  {
    id: "0xdemo008",
    ts: Date.now() - 1800000, // 30 minutes ago
    from: "USDC",
    to: "WETH",
    amountIn: 50000,
    amountOut: 25.0,
    wallet: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    tx: "0xdemo008tx",
    usdValue: 50000,
  },
  {
    id: "0xdemo009",
    ts: Date.now() - 2400000, // 40 minutes ago
    from: "WETH",
    to: "USDC",
    amountIn: 3.5,
    amountOut: 7000,
    wallet: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    tx: "0xdemo009tx",
    usdValue: 7000,
  },
  {
    id: "0xdemo010",
    ts: Date.now() - 3000000, // 50 minutes ago
    from: "BRETT",
    to: "DEGEN",
    amountIn: 25000,
    amountOut: 180000,
    wallet: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
    tx: "0xdemo010tx",
    usdValue: 2800,
  },
];

export const DEMO_ROOM_DATA = {
  code: "DEMO",
  wallets: DEMO_WALLETS.map(w => w.address),
  labels: Object.fromEntries(DEMO_WALLETS.map(w => [w.address, w.label])),
  createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
};
