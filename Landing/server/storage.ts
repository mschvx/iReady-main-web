import { type User, type InsertUser } from "@shared/schema";
import { randomUUID } from "crypto";
import fs from 'fs';
import path from 'path';

// modify the interface with any CRUD methods
// you might need

export interface BarangayClaim {
  barangayCode: string;
  userId: string;
  username: string;
  claimedAt: number;
}

export interface UserProfile {
  userId: string;
  username: string;
  summary?: string;
  email?: string;
  phone?: string;
  socialLinks?: Array<{ name: string; link: string }>;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  claimBarangay(barangayCode: string, userId: string, username: string): Promise<BarangayClaim | null>;
  getBarangayClaim(barangayCode: string): Promise<BarangayClaim | undefined>;
  getAllClaims(): Promise<BarangayClaim[]>;
  saveUserProfile(profile: UserProfile): Promise<void>;
  getUserProfile(username: string): Promise<UserProfile | undefined>;
  resetAll(): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private barangayClaims: Map<string, BarangayClaim>;
  private userProfiles: Map<string, UserProfile>;
  private storageFile: string;

  constructor() {
    this.users = new Map();
    this.barangayClaims = new Map();
    this.userProfiles = new Map();
    // Persist storage to a JSON file next to this module so data survives restarts
    // Use process.cwd() to avoid relying on __dirname in ESM mode
    this.storageFile = path.resolve(process.cwd(), 'server', 'storage.json');
    this.loadFromDisk();
    }


  private loadFromDisk() {
    try {
      if (!fs.existsSync(this.storageFile)) return;
      const raw = fs.readFileSync(this.storageFile, 'utf-8');
      const parsed = JSON.parse(raw || '{}');
      if (parsed.users && Array.isArray(parsed.users)) {
        for (const u of parsed.users) {
          this.users.set(u.id, u as User);
        }
      }
      if (parsed.barangayClaims && Array.isArray(parsed.barangayClaims)) {
        for (const c of parsed.barangayClaims) {
          this.barangayClaims.set(c.barangayCode, c as BarangayClaim);
        }
      }
      if (parsed.userProfiles && Array.isArray(parsed.userProfiles)) {
        for (const p of parsed.userProfiles) {
          this.userProfiles.set(p.username.toLowerCase(), p as UserProfile);
        }
      }
    } catch (err) {
      console.error('Failed to load storage from disk:', err);
    }
  }

  private saveToDisk() {
    try {
      const obj = {
        users: Array.from(this.users.values()),
        barangayClaims: Array.from(this.barangayClaims.values()),
        userProfiles: Array.from(this.userProfiles.values()),
      };
      fs.writeFileSync(this.storageFile, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to persist storage to disk:', err);
    }
  }
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    this.saveToDisk();
    return user;
  }

  async claimBarangay(barangayCode: string, userId: string, username: string): Promise<BarangayClaim | null> {
    // Check if already claimed
    const existing = this.barangayClaims.get(barangayCode);
    if (existing) {
      return null; // Already claimed by someone
    }
    
    const claim: BarangayClaim = {
      barangayCode,
      userId,
      username,
      claimedAt: Date.now(),
    };
    this.barangayClaims.set(barangayCode, claim);
    this.saveToDisk();
    return claim;
  }

  async getBarangayClaim(barangayCode: string): Promise<BarangayClaim | undefined> {
    return this.barangayClaims.get(barangayCode);
  }

  async getAllClaims(): Promise<BarangayClaim[]> {
    return Array.from(this.barangayClaims.values());
  }

  async saveUserProfile(profile: UserProfile): Promise<void> {
    this.userProfiles.set(profile.username.toLowerCase(), profile);
    this.saveToDisk();
  }

  async getUserProfile(username: string): Promise<UserProfile | undefined> {
    return this.userProfiles.get(username.toLowerCase());
  }

  async resetAll(): Promise<void> {
    this.users.clear();
    this.barangayClaims.clear();
    this.userProfiles.clear();
    try {
      if (fs.existsSync(this.storageFile)) fs.unlinkSync(this.storageFile);
    } catch (err) {
      console.error('Failed to remove storage file during reset:', err);
    }
    console.log("🗑️ All storage data has been reset");
  }
}

export const storage = new MemStorage();
