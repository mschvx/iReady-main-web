import { type User, type InsertUser } from "@shared/schema";
import { randomUUID } from "crypto";

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

  constructor() {
    this.users = new Map();
    this.barangayClaims = new Map();
    this.userProfiles = new Map();
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
  }

  async getUserProfile(username: string): Promise<UserProfile | undefined> {
    return this.userProfiles.get(username.toLowerCase());
  }

  async resetAll(): Promise<void> {
    this.users.clear();
    this.barangayClaims.clear();
    this.userProfiles.clear();
    console.log("🗑️ All storage data has been reset");
  }
}

export const storage = new MemStorage();
