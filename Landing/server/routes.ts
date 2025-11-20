import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import bcrypt from "bcryptjs";
import { insertUserSchema } from "@shared/schema";
import fs from "fs";
import path from "path";

export async function registerRoutes(app: Express): Promise<Server> {
  const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";

  app.use(
    session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "strict",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    })
  );

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid input" });
      }

      const { username, password } = result.data;
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({ username, password: hashedPassword });
      // @ts-ignore - session typing not extended here
      req.session.userId = user.id;
      res.status(201).json({ message: "User created successfully", user: { id: user.id, username: user.username } });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body as { username?: string; password?: string };
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      // @ts-ignore
      req.session.userId = user.id;
      res.json({ message: "Login successful", user: { id: user.id, username: user.username } });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    // @ts-ignore
    req.session.destroy((err: unknown) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logout successful" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    // @ts-ignore
    const userId = req.session.userId as string | undefined;
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    res.json({ user: { id: user.id, username: user.username } });
  });

  app.get("/api/geocode", async (req, res) => {
    try {
      const q = req.query.q as string | undefined;
      if (!q) {
        return res.status(400).json({ message: "Search query is required" });
      }
      // First try to match a local POI (simple substring/keyword match)
      try {
        const pois: Array<{ id: string; name: string; lat: number; lon: number; keywords?: string[] }> = require("./data/navotas_pois.json");
        const qLower = q.toLowerCase().trim();
        // Exact name substring match
        let match = pois.find(p => p.name.toLowerCase().includes(qLower));
        if (!match) {
          // Keyword match
          match = pois.find(p => (p.keywords || []).some(k => k.toLowerCase().includes(qLower) || qLower.includes(k.toLowerCase())));
        }
        if (match) {
          return res.json({ lat: match.lat, lon: match.lon, displayName: match.name, source: "local" });
        }
      } catch (err) {
        console.warn("Local POIs load failed:", err);
        // continue to external geocode fallback
      }

      const searchQuery = `${q}, Philippines`;
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`;
      const response = await fetch(url, {
        headers: { "User-Agent": "iReady-App/1.0" },
      });
      if (!response.ok) {
        return res.status(response.status).json({ message: "Geocoding service error" });
      }
      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        return res.status(404).json({ message: "Location not found" });
      }
      const { lat, lon, display_name } = data[0];
      res.json({ lat: parseFloat(lat), lon: parseFloat(lon), displayName: display_name, source: "nominatim" });
    } catch (error) {
      console.error("Geocoding error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Serve ToReceive area codes for local searching
  app.get("/api/toreceive", async (_req, res) => {
    try {
      // Read the Data/ToReceive.json file from repository root. Use process.cwd()
      // so this works regardless of how Node resolves __dirname under ESM.
  // The authoritative ToReceive.json lives in the repository root's parent (VERSION 2/Data)
  // when running from the Landing folder. Resolve to ../Data/ToReceive.json
  const dataFile = path.resolve(process.cwd(), "..", "Data", "ToReceive.json");
      if (!fs.existsSync(dataFile)) {
        return res.status(500).json({ message: "ToReceive data not found" });
      }
      const raw = fs.readFileSync(dataFile, "utf-8");
      const parsed = JSON.parse(raw) as Array<Record<string, any>>;
      const codes = parsed.map((r) => r.adm4_pcode).filter(Boolean);
      res.json({ codes });
    } catch (err) {
      console.error("/api/toreceive error:", err);
      res.status(500).json({ message: "Failed to read ToReceive data" });
    }
  });

  // Also serve the raw ToReceive.json so client-side code can fetch it from
  // /ToReceive.json or /data/ToReceive.json (keeps existing UI unchanged).
  const serveToReceiveRaw = (req: any, res: any) => {
    try {
  const dataFile = path.resolve(process.cwd(), "..", "Data", "ToReceive.json");
      if (!fs.existsSync(dataFile)) {
        return res.status(404).json({ message: "ToReceive.json not found" });
      }
      const raw = fs.readFileSync(dataFile, "utf-8");
      // send as application/json so browser fetch() can parse it directly
      res.setHeader('Content-Type', 'application/json');
      return res.send(raw);
    } catch (err) {
      console.error("/ToReceive.json error:", err);
      return res.status(500).json({ message: "Failed to read ToReceive.json" });
    }
  };

  app.get('/ToReceive.json', serveToReceiveRaw);
  app.get('/data/ToReceive.json', serveToReceiveRaw);

  // POI search endpoint
  app.get("/api/pois", async (req, res) => {
    try {
      const q = req.query.q as string | undefined;
      const all = req.query.all === 'true';
      const poisPath = path.resolve(__dirname, "data", "navotas_pois.json");
      
      if (!fs.existsSync(poisPath)) {
        return res.json({ results: [] });
      }
      
      const pois = JSON.parse(fs.readFileSync(poisPath, "utf-8"));
      
      if (all) {
        return res.json({ results: pois });
      }
      
      if (!q) {
        return res.json({ results: pois.slice(0, 10) });
      }
      
      const qLower = q.toLowerCase();
      const filtered = pois.filter((p: any) => 
        p.name?.toLowerCase().includes(qLower) ||
        (p.keywords || []).some((k: string) => k.toLowerCase().includes(qLower))
      ).slice(0, 10);
      
      res.json({ results: filtered });
    } catch (err) {
      console.error("/api/pois error:", err);
      res.json({ results: [] });
    }
  });

  // ADM4 search endpoint
  app.get("/api/adm4", async (req, res) => {
    try {
      const q = req.query.q as string | undefined;
      const filePath = path.resolve(__dirname, "..", "..", "Data", "ToReceive.json");
      
      if (!fs.existsSync(filePath)) {
        return res.json({ results: [] });
      }
      
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as Array<Record<string, any>>;
      
      if (!q) {
        return res.json({ results: parsed.slice(0, 10) });
      }
      
      const qLower = q.toLowerCase();
      const filtered = parsed.filter((item) => 
        item.adm4_pcode?.toLowerCase().includes(qLower)
      ).slice(0, 10);
      
      res.json({ results: filtered });
    } catch (err) {
      console.error("/api/adm4 error:", err);
      res.json({ results: [] });
    }
  });

  // Reverse lookup wrapper to classify if a point is water (keyword-based)
  app.get('/api/reverse', async (req, res) => {
    try {
      const lat = req.query.lat as string | undefined;
      const lon = req.query.lon as string | undefined;
      if (!lat || !lon) return res.status(400).json({ message: 'lat and lon required' });
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=10&addressdetails=0`;
      const response = await fetch(url, { headers: { 'User-Agent': 'iReady-App/1.0' } });
      if (!response.ok) return res.status(502).json({ message: 'Reverse geocode failed' });
      const data = await response.json();
      const display = (data.display_name || '').toLowerCase();
      const waterKeywords = ['sea','bay','ocean','lake','river','channel','canal','marina','harbor','harbour'];
      const isWater = waterKeywords.some(k => display.includes(k));
      res.json({ displayName: data.display_name || null, isWater });
    } catch (err) {
      console.error('/api/reverse error:', err);
      res.status(500).json({ message: 'Reverse lookup failed' });
    }
  });

  // Claim a barangay
  app.post('/api/barangay/claim', async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session.userId as string | undefined;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { barangayCode } = req.body as { barangayCode?: string };
      if (!barangayCode) {
        return res.status(400).json({ message: "Barangay code is required" });
      }

      const claim = await storage.claimBarangay(barangayCode, userId, user.username);
      if (!claim) {
        return res.status(409).json({ message: "Barangay already claimed by another user" });
      }

      res.json({ success: true, claim });
    } catch (error) {
      console.error("Claim barangay error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get barangay claim status
  app.get('/api/barangay/claim/:code', async (req, res) => {
    try {
      const { code } = req.params;
      const claim = await storage.getBarangayClaim(code);
      
      if (!claim) {
        return res.json({ claimed: false });
      }

      res.json({ 
        claimed: true, 
        claimant: claim.username,
        claimedAt: claim.claimedAt 
      });
    } catch (error) {
      console.error("Get barangay claim error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get all barangay claims
  app.get('/api/barangay/claims', async (req, res) => {
    try {
      const claims = await storage.getAllClaims();
      res.json({ claims });
    } catch (error) {
      console.error("Get all claims error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Save user profile
  app.post('/api/profile', async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session.userId as string | undefined;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const { summary, email, phone, socialLinks } = req.body;
      console.log(`Saving profile for user ${user.username}:`, { summary, email, phone, socialLinks });
      await storage.saveUserProfile({
        userId: user.id,
        username: user.username,
        summary,
        email,
        phone,
        socialLinks,
      });

      res.json({ success: true, message: "Profile saved" });
    } catch (error) {
      console.error("Save profile error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get user profile by username (public endpoint)
  app.get('/api/profile/:username', async (req, res) => {
    try {
      const { username } = req.params;
      console.log(`Fetching profile for username: ${username}`);
      const profile = await storage.getUserProfile(username);
      console.log(`Profile found:`, profile);
      
      if (!profile) {
        return res.json({ 
          username,
          summary: null,
          email: null,
          phone: null,
          socialLinks: []
        });
      }

      res.json(profile);
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Reset all data (users, claims, everything) - for development/testing only
  app.post('/api/reset-all', async (req, res) => {
    try {
      await storage.resetAll();
      // Also destroy the session
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destroy error:", err);
        }
      });
      res.json({ message: "All data has been reset successfully" });
    } catch (error) {
      console.error("Reset all error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
