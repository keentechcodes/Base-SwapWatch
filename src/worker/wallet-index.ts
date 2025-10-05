/**
 * Wallet Index Management for Room Tracking
 * Maintains a bi-directional index between wallets and rooms
 */

import type { KVNamespace } from '@cloudflare/workers-types';

export interface WalletIndexEntry {
  rooms: string[]; // List of room codes tracking this wallet
  lastUpdated: number;
}

export interface RoomWalletsEntry {
  wallets: string[]; // List of wallets tracked by this room
  lastUpdated: number;
}

/**
 * Add a wallet to a room's tracking list
 */
export async function addWalletToRoom(
  kv: KVNamespace,
  walletAddress: string,
  roomCode: string
): Promise<void> {
  const normalizedWallet = walletAddress.toLowerCase();

  // Update wallet -> rooms index
  const walletKey = `wallet:${normalizedWallet}`;
  const existing = await kv.get<WalletIndexEntry>(walletKey, 'json');

  if (existing) {
    if (!existing.rooms.includes(roomCode)) {
      existing.rooms.push(roomCode);
      existing.lastUpdated = Date.now();
      await kv.put(walletKey, JSON.stringify(existing));
    }
  } else {
    const entry: WalletIndexEntry = {
      rooms: [roomCode],
      lastUpdated: Date.now(),
    };
    await kv.put(walletKey, JSON.stringify(entry));
  }

  // Update room -> wallets index
  const roomKey = `room:${roomCode}:wallets`;
  const roomEntry = await kv.get<RoomWalletsEntry>(roomKey, 'json');

  if (roomEntry) {
    if (!roomEntry.wallets.includes(normalizedWallet)) {
      roomEntry.wallets.push(normalizedWallet);
      roomEntry.lastUpdated = Date.now();
      await kv.put(roomKey, JSON.stringify(roomEntry));
    }
  } else {
    const entry: RoomWalletsEntry = {
      wallets: [normalizedWallet],
      lastUpdated: Date.now(),
    };
    await kv.put(roomKey, JSON.stringify(entry));
  }
}

/**
 * Remove a wallet from a room's tracking list
 */
export async function removeWalletFromRoom(
  kv: KVNamespace,
  walletAddress: string,
  roomCode: string
): Promise<void> {
  const normalizedWallet = walletAddress.toLowerCase();

  // Update wallet -> rooms index
  const walletKey = `wallet:${normalizedWallet}`;
  const existing = await kv.get<WalletIndexEntry>(walletKey, 'json');

  if (existing) {
    existing.rooms = existing.rooms.filter(r => r !== roomCode);
    existing.lastUpdated = Date.now();

    if (existing.rooms.length === 0) {
      // No rooms tracking this wallet anymore
      await kv.delete(walletKey);
    } else {
      await kv.put(walletKey, JSON.stringify(existing));
    }
  }

  // Update room -> wallets index
  const roomKey = `room:${roomCode}:wallets`;
  const roomEntry = await kv.get<RoomWalletsEntry>(roomKey, 'json');

  if (roomEntry) {
    roomEntry.wallets = roomEntry.wallets.filter(w => w !== normalizedWallet);
    roomEntry.lastUpdated = Date.now();

    if (roomEntry.wallets.length === 0) {
      await kv.delete(roomKey);
    } else {
      await kv.put(roomKey, JSON.stringify(roomEntry));
    }
  }
}

/**
 * Get all rooms tracking a specific wallet
 */
export async function getRoomsForWallet(
  kv: KVNamespace,
  walletAddress: string
): Promise<string[]> {
  const normalizedWallet = walletAddress.toLowerCase();
  const walletKey = `wallet:${normalizedWallet}`;
  const entry = await kv.get<WalletIndexEntry>(walletKey, 'json');

  return entry?.rooms || [];
}

/**
 * Get all wallets tracked by a room
 */
export async function getWalletsForRoom(
  kv: KVNamespace,
  roomCode: string
): Promise<string[]> {
  const roomKey = `room:${roomCode}:wallets`;
  const entry = await kv.get<RoomWalletsEntry>(roomKey, 'json');

  return entry?.wallets || [];
}

/**
 * Clean up room index when room expires
 */
export async function cleanupRoomIndex(
  kv: KVNamespace,
  roomCode: string
): Promise<void> {
  // Get all wallets for this room
  const wallets = await getWalletsForRoom(kv, roomCode);

  // Remove room from each wallet's index
  for (const wallet of wallets) {
    await removeWalletFromRoom(kv, wallet, roomCode);
  }

  // Delete room's wallet list
  await kv.delete(`room:${roomCode}:wallets`);
}