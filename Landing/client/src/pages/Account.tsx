import React, { useMemo, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

interface AppUser {
  id: string;
  username: string;
}

export const Account = (): JSX.Element => {
  const [, setLocation] = useLocation();
  const goHome = () => setLocation("/home");
  const goBack = () => setLocation("/home");

  // Auth state: always fetch current user from the server to avoid stale local data
  const [user, setUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // Helper to namespace localStorage keys per user to avoid cross-account leakage
  const userKey = (key: string) => (user ? `user:${user.id}:${key}` : `user:anon:${key}`);

  // single source-of-truth for the user's name: `username`
  // read from localStorage (or your auth store). Falls back to placeholder.
  const [username, setUsername] = useState<string>("");

  // organization/profile editable fields (persisted to localStorage, namespaced per user)
  const [summary, setSummary] = useState<string>("");
  const [social, setSocial] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<string>("");

  // Social media links stored as array of {name, link}
  const [socialLinks, setSocialLinks] = useState<Array<{name: string, link: string}>>([]);

  // barangay history from localStorage
  const [barangayHistory, setBarangayHistory] = useState<Array<{code: string, timestamp: number}>>([]);
  // barangay claims from server (to show who claimed what)
  const [barangayClaims, setBarangayClaims] = useState<Record<string, string>>({});

  // Prediction data for current barangay
  const [currentPrediction, setCurrentPrediction] = useState<any>(null);
  // Simple checklist items (per-barangay) - editable list with quantity
  interface SimpleItem {
    id: string;
    text: string;
    qty: number;
  }

  const [items, setItems] = useState<SimpleItem[]>(() => {
    const currentBarangay = barangayHistory[0]?.code;
    if (!currentBarangay) return [];
    const stored = localStorage.getItem(`checklist_items_${currentBarangay}`);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return [];
      }
    }
    return [];
  });

    // Co-responder (backup) request state, stored per-barangay
    const [coResponderEnabled, setCoResponderEnabled] = useState<boolean>(false);
    const [coResponderQty, setCoResponderQty] = useState<number>(1);
    const [blockedClaimant, setBlockedClaimant] = useState<string | null>(null);

  // small inputs for adding a new item
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editSummary, setEditSummary] = useState<string>("");
  // multiple social entries support with name and link
  const [editSocialList, setEditSocialList] = useState<Array<{name: string, link: string}>>([]);
  const [editEmail, setEditEmail] = useState<string>("");
  const [editPhone, setEditPhone] = useState<string>("");

  // Checklist add item modal state
  // (old priority-based checklist modal removed; using simple per-barangay items)

  // Fetch current authenticated user; redirect if unauthenticated
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/auth/me", { credentials: "include" });
        if (!resp.ok) {
          setAuthLoading(false);
          setLocation("/login");
          return;
        }
        const data = await resp.json();
        const u = data.user as AppUser;
        setUser(u);
        setUsername(u.username);
      } catch (err) {
        setLocation("/login");
      } finally {
        setAuthLoading(false);
      }
    })();
  }, [setLocation]);

  // Once user is known, load their namespaced profile fields; migrate legacy keys if found
  useEffect(() => {
    if (!user) return;
    // Try namespaced first
    const nsSummary = localStorage.getItem(userKey("summary"));
    const nsEmail = localStorage.getItem(userKey("contact_email"));
    const nsPhone = localStorage.getItem(userKey("contact_phone"));
    const nsSocials = localStorage.getItem(userKey("contact_socials_links"));

    // Legacy (non-namespaced) keys fallback
    const legacySummary = localStorage.getItem("summary");
    const legacyEmail = localStorage.getItem("contact_email");
    const legacyPhone = localStorage.getItem("contact_phone");
    const legacySocials = localStorage.getItem("contact_socials_links");

    const resolvedSummary = nsSummary ?? legacySummary ?? "";
    const resolvedEmail = nsEmail ?? legacyEmail ?? "";
    const resolvedPhone = nsPhone ?? legacyPhone ?? "";
    const resolvedSocials = nsSocials ?? legacySocials ?? "[]";

    setSummary(resolvedSummary);
    setEmail(resolvedEmail);
    setPhone(resolvedPhone);
    try {
      setSocialLinks(JSON.parse(resolvedSocials || "[]"));
    } catch {
      setSocialLinks([]);
    }

    // Migrate legacy to namespaced and remove legacy to prevent cross-user leakage
    if (legacySummary && !nsSummary) localStorage.setItem(userKey("summary"), legacySummary);
    if (legacyEmail && !nsEmail) localStorage.setItem(userKey("contact_email"), legacyEmail);
    if (legacyPhone && !nsPhone) localStorage.setItem(userKey("contact_phone"), legacyPhone);
    if (legacySocials && !nsSocials) localStorage.setItem(userKey("contact_socials_links"), legacySocials);
    // Optionally clear legacy keys (commented initially to avoid surprises; uncomment if desired)
    // localStorage.removeItem("summary");
    // localStorage.removeItem("contact_email");
    // localStorage.removeItem("contact_phone");
    // localStorage.removeItem("contact_socials_links");
  }, [user]);

  useEffect(() => {
    // Load prediction data and barangay history, then fetch claims so we can avoid showing a barangay
    // that has already been claimed by someone else.
    (async () => {
      try {
        const [toRecvResp, claimsResp] = await Promise.all([
          fetch("/ToReceive.json"),
          fetch("/api/barangay/claims", { credentials: "include" }),
        ]);

        const claimsMap: Record<string, string> = {};
        if (claimsResp && claimsResp.ok) {
          try {
            const claimsJson = await claimsResp.json();
            (claimsJson.claims || []).forEach((c: any) => (claimsMap[c.barangayCode] = c.username));
            setBarangayClaims(claimsMap);
          } catch (e) {
            console.error('Failed to parse claims JSON', e);
          }
        }

        if (toRecvResp && toRecvResp.ok) {
          const data = await toRecvResp.json();

          try {
            const historyData = localStorage.getItem("barangay_history");
            if (historyData) {
              const parsed = JSON.parse(historyData);
              setBarangayHistory(Array.isArray(parsed) ? parsed : []);

              if (parsed.length > 0) {
                const currentBarangay = parsed[0].code;

                // If currentBarangay is claimed by someone else, don't show it as focused here
                const claimant = claimsMap[currentBarangay];
                if (claimant && claimant !== (user?.username || null)) {
                  setCurrentPrediction(null);
                  setItems([]);
                  setBlockedClaimant(claimant);
                } else {
                  setBlockedClaimant(null);
                  const storedItems = localStorage.getItem(`checklist_items_${currentBarangay}`);
                  if (storedItems) {
                    try {
                      setItems(JSON.parse(storedItems));
                    } catch {
                      setItems([]);
                    }
                  }

                  // load co-responder preference for this barangay
                  try {
                    const coRaw = localStorage.getItem(`co_responder_${currentBarangay}`);
                    if (coRaw) {
                      const parsedCo = JSON.parse(coRaw);
                      setCoResponderEnabled(Boolean(parsedCo.enabled));
                      setCoResponderQty(typeof parsedCo.qty === 'number' ? parsedCo.qty : 1);
                    } else {
                      setCoResponderEnabled(false);
                      setCoResponderQty(1);
                    }
                  } catch {
                    setCoResponderEnabled(false);
                    setCoResponderQty(1);
                  }

                  // Set prediction data
                  const prediction = data.find((p: any) => p.adm4_pcode === currentBarangay);
                  setCurrentPrediction(prediction || null);
                }
              }
            }
          } catch (err) {
            console.error("Failed to load barangay history:", err);
          }
        }
      } catch (err) {
        console.error("Initialization failed:", err);
      }
    })();
  }, [user]);

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((p) => p.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("");
  const stringToColor = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
    const hue = Math.abs(h) % 360;
    return `hsl(${hue} 60% 55%)`;
  };
  const avatarDataUrl = useMemo(() => {
    const initials = getInitials(username || "U");
    const bg = stringToColor(username || "user");
    const size = 160;
    const fontSize = 64;
    const svg = `
      <svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>
        <rect width='100%' height='100%' rx='999' fill='${bg}' />
        <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Helvetica, Arial, sans-serif' font-size='${fontSize}' fill='#fff' font-weight='700'>${initials}</text>
      </svg>
    `.trim();
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }, [username]);

  // allow editing the user's name (persists to localStorage and updates `User`)
  const handleEditName = () => {
    const newName = prompt("Enter display name", username || "");
    if (newName !== null) {
      const trimmed = newName.trim();
      if (trimmed.length > 0) {
        setUsername(trimmed);
        // also keep a display name stored per user to avoid cross-account collision
        localStorage.setItem(userKey("displayName"), trimmed);
      }
    }
  };

  // open modal and populate edit fields (supports multiple socials)
  const startEdit = () => {
    setEditSummary(summary);
    setEditEmail(email);
    setEditPhone(phone);
    // Load social links from state
    setEditSocialList(socialLinks.length > 0 ? socialLinks : []);
    setShowEditModal(true);
  };

  const saveDetails = async () => {
    setSummary(editSummary);
    localStorage.setItem(userKey("summary"), editSummary);
    
    // Save social links as JSON array
    const cleanedSocials = editSocialList.filter(s => s.name.trim() && s.link.trim());
    setSocialLinks(cleanedSocials);
    localStorage.setItem(userKey("contact_socials_links"), JSON.stringify(cleanedSocials));

    setEmail(editEmail);
    localStorage.setItem(userKey("contact_email"), editEmail);
    setPhone(editPhone);
    localStorage.setItem(userKey("contact_phone"), editPhone);
    
    // Also save to server for public profile
    try {
      console.log('Saving profile to server:', {
        summary: editSummary,
        email: editEmail,
        phone: editPhone,
        socialLinks: cleanedSocials,
      });
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          summary: editSummary,
          email: editEmail,
          phone: editPhone,
          socialLinks: cleanedSocials,
        }),
      });
      if (response.ok) {
        const result = await response.json();
        console.log('Profile saved successfully:', result);
      } else {
        console.error('Failed to save profile, status:', response.status);
      }
    } catch (err) {
      console.error("Failed to save profile to server:", err);
    }
    
    setShowEditModal(false);
  };

  const cancelEdit = () => {
    setShowEditModal(false);
  };

  const logout = async () => {
    try {
      // server-side session termination
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}

    // Clear all user-scoped keys from localStorage
    if (user) {
      const prefix = `user:${user.id}:`;
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    }

    // Clear in-memory state to avoid showing previous user's data
    setUser(null);
    setUsername("");
    setSummary("");
    setEmail("");
    setPhone("");
    setSocialLinks([]);

    // Navigate to login
    setLocation("/login");
  };

  // Manage simple items list
  const saveItems = (newItems: SimpleItem[]) => {
    setItems(newItems);
    const currentBarangay = barangayHistory[0]?.code;
    if (currentBarangay) {
      localStorage.setItem(`checklist_items_${currentBarangay}`, JSON.stringify(newItems));
    }
  };

  const addItem = (text: string, qty: number) => {
    if (!text.trim()) return;
    const newItem: SimpleItem = { id: `it-${Date.now()}-${Math.random()}`, text: text.trim(), qty: qty || 1 };
    saveItems([...items, newItem]);
  };

  const updateItem = (id: string, fields: Partial<SimpleItem>) => {
    saveItems(items.map(it => (it.id === id ? { ...it, ...fields } : it)));
  };

  const deleteItem = (id: string) => {
    saveItems(items.filter(it => it.id !== id));
  };

  // When focused barangay changes, reload items for that barangay
  useEffect(() => {
    const currentBarangay = barangayHistory[0]?.code;
    if (!currentBarangay) {
      setItems([]);
      return;
    }
    const stored = localStorage.getItem(`checklist_items_${currentBarangay}`);
    if (stored) {
      try {
        setItems(JSON.parse(stored));
      } catch {
        setItems([]);
      }
    } else {
      setItems([]);
    }
    // load co-responder preference for this barangay
    try {
      const coRaw = localStorage.getItem(`co_responder_${currentBarangay}`);
      if (coRaw) {
        const parsedCo = JSON.parse(coRaw);
        setCoResponderEnabled(Boolean(parsedCo.enabled));
        setCoResponderQty(typeof parsedCo.qty === 'number' ? parsedCo.qty : 1);
      } else {
        setCoResponderEnabled(false);
        setCoResponderQty(1);
      }
    } catch {
      setCoResponderEnabled(false);
      setCoResponderQty(1);
    }
  }, [barangayHistory]);

  if (authLoading) {
    return (
      <div className="bg-white w-full min-h-screen flex items-center justify-center">
        <p className="text-2xl">Loading...</p>
      </div>
    );
  }

  return (
    <div className="bg-white w-full min-h-screen overflow-hidden">
      {/* Header copied from FirstPage (logo on left, fixed) */}
      <header className="fixed top-0 left-0 w-full h-18 md:h-20 lg:h-24 z-[4000] bg-black shadow-none border-b-0 flex items-center">
        <div className="pl-4 md:pl-6 lg:pl-8">
          <img
            className="h-18 md:h-20 lg:h-22 w-auto block"
            alt="iReady Header"
            src="/figmaAssets/fixed.png"
          />
        </div>
      </header>

      {/* Top-right nav styled like FirstPage */}
      <nav className="fixed top-0 right-0 z-[4100] flex gap-3 md:gap-4 pr-4 md:pr-8 pt-3 md:pt-4 lg:pt-6">
        <Button onClick={goHome} className="h-10 md:h-12 px-4 md:px-6 bg-gray-700 rounded-full hover:bg-gray-600 text-sm md:text-base">
          Home
        </Button>
        <Button className="h-10 md:h-12 px-4 md:px-6 bg-blue-700 rounded-full hover:bg-sky-300 text-sm md:text-base">
          Account
        </Button>
      </nav>

      {/* Main content */}
      {/* make page area scrollable and let the grid resize columns responsively:
                      - left column can grow (minmax) up to ~42% of width
                                - right column takes remaining space
                                        */}
      <main className="pt-16 md:pt-20 lg:pt-24 px-6">
        {/* centered two-column group: narrower max-width so it visually centers, and vertically centered */}
        <div className="max-w-7xl mx-auto h-[calc(100vh-6rem)] flex items-center justify-center">
          <div className="grid gap-4 place-items-center min-h-full w-full max-w-7xl
                          grid-cols-1
                          md:[grid-template-columns:minmax(240px,360px)_minmax(0,3fr)]">
            {/* Left column: slightly wider profile card but still smaller than the main card */}
            <aside className="col-span-1 flex justify-center">
              {/* left card (smaller padding so group stays centered) */}
              <div className="w-full bg-gray-100 rounded-2xl p-6 shadow-md text-center">
                <img
                  src={avatarDataUrl}
                  alt={username}
                  className="w-24 h-24 rounded-full shadow-lg mb-3 object-cover mx-auto"
                />
                <div
                  className="text-xl font-semibold text-center whitespace-normal max-w-full"
                  title={username}
                >
                  {username}
                </div>

                {/* Red logout button placed directly below the username */}
                <button
                  onClick={logout}
                  className="mt-2 bg-red-500 text-white px-3 py-1 rounded-full shadow-sm hover:opacity-90 text-xs"
                  aria-label="Log out"
                >
                  Log out
                </button>

                {/* Editable organization/profile fields inside the same card */}
                <div className="w-full text-left mt-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-gray-700">Summary</div>
                    <button onClick={startEdit} className="text-xs text-blue-600 hover:underline">Edit</button>
                  </div>
                  <div className="text-xs text-gray-600 mt-1 whitespace-pre-wrap break-all max-h-16 overflow-y-auto overflow-x-hidden">
                    {summary || <span className="text-gray-400">(not set)</span>}
                  </div>

                  <div className="mt-3">
                    <div className="text-xs font-medium text-gray-700">Barangays Helped</div>
                    <div className="text-xs text-gray-600 mt-1 whitespace-pre-wrap max-h-20 overflow-y-auto">
                      {(() => {
                        const myBarangays = barangayHistory.filter(item => barangayClaims[item.code] === username);
                        return myBarangays.length > 0 ? (
                          <div className="space-y-1">
                            {myBarangays.slice(0, 3).map((item, idx) => (
                              <div key={idx} className="flex items-center gap-1 text-xs">
                                <button
                                  onClick={() => setLocation(`/home?barangay=${encodeURIComponent(item.code)}`)}
                                  className="text-blue-600 hover:underline"
                                >
                                  {item.code}
                                </button>
                                <span className="text-[10px] px-1 py-0.5 rounded bg-green-100 text-green-700">
                                  {username}
                                </span>
                              </div>
                            ))}
                            {myBarangays.length > 3 && (
                              <div className="text-[10px] text-gray-400 italic">+{myBarangays.length - 3} more</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">(no barangays claimed yet)</span>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="text-xs font-medium text-gray-700">Contact Information</div>
                    <div className="ml-3 mt-1 space-y-1">
                      <div>
                        <div className="text-xs font-medium text-gray-600">Social:</div>
                        {socialLinks.length > 0 ? (
                          <div className="ml-2 space-y-0.5 mt-0.5">
                            {socialLinks.slice(0, 2).map((social, idx) => (
                              <div key={idx}>
                                <a 
                                  href={social.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline"
                                >
                                  {social.name}
                                </a>
                              </div>
                            ))}
                            {socialLinks.length > 2 && (
                              <div className="text-[10px] text-gray-400 italic">+{socialLinks.length - 2} more</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 ml-2">(not set)</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600">
                        <span className="font-medium text-gray-600">Email:</span> 
                        <span className="ml-1">{email || <span className="text-gray-400">(not set)</span>}</span>
                      </div>
                      <div className="text-xs text-gray-600">
                        <span className="font-medium text-gray-600">Phone:</span> 
                        <span className="ml-1">{phone || <span className="text-gray-400">(not set)</span>}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            {/* Center / right: main card (content centered inside card) */}
            <section className="col-span-1 w-full bg-gray-100 rounded-2xl p-6 shadow-md text-center justify-self-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-3">Current Barangay Focus</h2>

               {barangayHistory.length > 0 ? (
                 <>
                   <div className="mb-2">
                     <button
                       onClick={() => setLocation(`/home?barangay=${encodeURIComponent(barangayHistory[0].code)}`)}
                       className="text-blue-600 inline-flex items-center text-lg md:text-xl font-bold underline hover:text-blue-800"
                     >
                       ↗&nbsp; {barangayHistory[0].code}
                     </button>
                   </div>
    
                   
                   
                   <div className="text-xs text-gray-500 mb-2">
                     Last updated: {new Date(barangayHistory[0].timestamp).toLocaleDateString()}
                   </div>
                  {blockedClaimant && (
                    <div className="max-w-3xl mx-auto mb-4">
                      <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                        This barangay is currently claimed by <span className="font-semibold">{blockedClaimant}</span>. You cannot manage it here.
                      </div>
                    </div>
                  )}
                 </>
               ) : (
                 <div className="text-base text-gray-500 mb-3">
                   No barangay focused yet. Visit the Home page to select one.
                 </div>
               )}
 
               <div className="mt-2">
                 <div className="mb-4 max-w-3xl mx-auto">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                     <div className="w-full">
                       {currentPrediction ? (
                         <div className="bg-white rounded p-4 border border-gray-300">
                           <div className="text-xs text-gray-600 font-medium">Vulnerability</div>
                           <div className="flex items-baseline gap-3 justify-center mt-2">
                             <div className="text-3xl font-bold text-red-600">
                               {typeof currentPrediction.proxy_risk_score === 'number' ? `${Math.round(currentPrediction.proxy_risk_score * 100)}%` : 'N/A'}
                             </div>
                             <div className="text-sm text-gray-700">
                               {(() => {
                                 const labels = ['Low', 'Medium', 'High', 'Very High'];
                                 const idx = typeof currentPrediction.predicted_risk_level === 'number' ? currentPrediction.predicted_risk_level : null;
                                 return idx !== null && labels[idx] ? labels[idx] : (typeof currentPrediction.proxy_risk_score === 'number' ? (currentPrediction.proxy_risk_score > 0.75 ? 'Very High' : currentPrediction.proxy_risk_score > 0.5 ? 'High' : currentPrediction.proxy_risk_score > 0.25 ? 'Medium' : 'Low') : 'N/A');
                               })()}
                             </div>
                           </div>
                           {currentPrediction.predicted_risk_confidence ? (
                             <div className="text-xs text-gray-500 mt-2">Model confidence: {Math.round((currentPrediction.predicted_risk_confidence || 0) * 100)}%</div>
                           ) : null}
                           <div className="text-xs text-gray-500 mt-2">This is an estimated vulnerability score computed from local data.</div>
                         </div>
                       ) : (
                         <div className="text-center text-gray-500">No vulnerability data available for the selected barangay.</div>
                       )}
                     </div>

                     <div className="w-full">
                       <div className="bg-white rounded p-4 border border-gray-300">
                         <div className="text-sm font-medium mb-2">Request Backup</div>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={coResponderEnabled}
                            disabled={!!blockedClaimant}
                            onChange={(e) => {
                              if (blockedClaimant) return;
                              const en = e.target.checked;
                              setCoResponderEnabled(en);
                              const currentBarangay = barangayHistory[0]?.code;
                              if (currentBarangay) localStorage.setItem(`co_responder_${currentBarangay}`, JSON.stringify({ enabled: en, qty: coResponderQty }));
                            }}
                          />
                          <span>{blockedClaimant ? 'Ask for backup (disabled)' : 'Ask for backup'}</span>
                        </label>

                         <div className="mt-3 text-sm">
                           <label className="block text-xs text-gray-500">Number of co-responders (max 3)</label>
                           <input
                             type="number"
                             min={1}
                             max={3}
                             value={coResponderQty}
                             disabled={!coResponderEnabled || !!blockedClaimant}
                             onChange={(e) => {
                               if (blockedClaimant) return;
                               let v = parseInt(e.target.value || '1', 10) || 1;
                               if (v > 3) v = 3;
                               if (v < 1) v = 1;
                               setCoResponderQty(v);
                               const currentBarangay = barangayHistory[0]?.code;
                               if (currentBarangay) localStorage.setItem(`co_responder_${currentBarangay}`, JSON.stringify({ enabled: coResponderEnabled, qty: v }));
                             }}
                             className="w-full rounded-md border p-2 mt-1 text-sm"
                           />
                         </div>

                         <div className="text-xs text-gray-400 mt-3">Enabling shows Request Backup on Home.</div>
                       </div>
                     </div>
                   </div>
                 </div>

                 <div className="bg-white rounded-2xl border-4 border-blue-300 p-4 shadow-inner flex flex-col md:h-56 overflow-hidden">
                   <h3 className="text-xl font-semibold mb-2 text-center">Checklist</h3>
                   <div className="max-w-2xl mx-auto w-full">
                     <div className="flex gap-2 mb-3">
                       <input type="text" placeholder="Item description" className="flex-1 rounded-md border p-2 text-sm" id="new-item-text" />
                       <input type="number" min={1} defaultValue={1} className="w-20 rounded-md border p-2 text-sm" id="new-item-qty" />
                       <button
                         onClick={() => {
                           const txt = (document.getElementById('new-item-text') as HTMLInputElement)?.value || '';
                           const q = parseInt((document.getElementById('new-item-qty') as HTMLInputElement)?.value || '1', 10) || 1;
                           if (txt.trim()) {
                             addItem(txt, q);
                             (document.getElementById('new-item-text') as HTMLInputElement).value = '';
                             (document.getElementById('new-item-qty') as HTMLInputElement).value = '1';
                           }
                         }}
                         className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm"
                       >Add</button>
                     </div>

                     <div className="space-y-2 max-h-40 overflow-y-auto">
                         {items.length === 0 ? (
                         <div className="text-sm text-gray-500 text-center">No items yet. Add a task and quantity.</div>
                       ) : (
                         items.map((it) => (
                           <div key={it.id} className="flex items-center gap-2 p-2 border rounded-md">
                             <input
                               value={it.text}
                               onChange={(e) => updateItem(it.id, { text: e.target.value })}
                               className="flex-1 rounded-md border p-1 text-sm"
                             />
                             <input
                               type="number"
                               min={1}
                               value={it.qty}
                               onChange={(e) => updateItem(it.id, { qty: parseInt(e.target.value || '1', 10) || 1 })}
                               className="w-20 rounded-md border p-1 text-sm"
                             />
                             <button onClick={() => deleteItem(it.id)} className="text-red-600 px-2">Remove</button>
                           </div>
                         ))
                       )}
                     </div>
                   </div>
                 </div>
               </div>
            </section>
          </div>
        </div>
      </main>

      {/* Edit modal overlay (lightweight, similar to login/signup style) */}
      {showEditModal && (
  <div
    className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/30"
    role="dialog"
    aria-modal="true"
    onClick={() => setShowEditModal(false)}
  >
    <div
      className="relative w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]
                 transform transition-all duration-300 ease-out scale-100 opacity-100"
      onClick={(e) => e.stopPropagation()}
      style={{
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        position: "absolute",
      }}
    >
      <h3 className="text-lg font-semibold mb-3">Edit Profile</h3>
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium text-gray-700">Summary of organization</label>
          <textarea
            value={editSummary}
            onChange={(e) => setEditSummary(e.target.value)}
            maxLength={80}
            className="mt-1 block w-full rounded-md border-gray-200 shadow-sm p-2 text-sm"
            rows={3}
            placeholder="Brief description of your organization (max 80 characters)"
          />
          <div className="text-xs text-gray-500 mt-1 text-right">
            {editSummary.length}/80 characters
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Social media (add multiple)</label>
          <div className="space-y-3 mt-2">
            {editSocialList.map((s, idx) => (
              <div key={idx} className="border rounded-md p-3 bg-gray-50">
                <div className="space-y-2">
                  <input
                    value={s.name}
                    onChange={(e) => {
                      const copy = [...editSocialList];
                      copy[idx] = { ...copy[idx], name: e.target.value };
                      setEditSocialList(copy);
                    }}
                    className="w-full rounded-md border-gray-200 shadow-sm p-2 text-sm"
                    placeholder="Social media name (e.g., Facebook, Twitter)"
                  />
                  <input
                    value={s.link}
                    onChange={(e) => {
                      const copy = [...editSocialList];
                      copy[idx] = { ...copy[idx], link: e.target.value };
                      setEditSocialList(copy);
                    }}
                    className="w-full rounded-md border-gray-200 shadow-sm p-2 text-sm"
                    placeholder="Link to your profile (e.g., https://facebook.com/yourprofile)"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const copy = [...editSocialList];
                    copy.splice(idx, 1);
                    setEditSocialList(copy);
                  }}
                  className="mt-2 px-3 py-1 rounded-md bg-red-100 text-red-600 text-xs hover:bg-red-200"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setEditSocialList((s) => [...s, { name: "", link: "" }])}
              className="text-sm text-blue-600 hover:underline"
            >
              + Add social media
            </button>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Email</label>
          <input
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-200 shadow-sm p-2 text-sm"
            placeholder="email@example.com"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Phone</label>
          <input
            value={editPhone}
            onChange={(e) => setEditPhone(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-200 shadow-sm p-2 text-sm"
            placeholder="0917-xxx-xxxx"
          />
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={() => setShowEditModal(false)}
            className="px-3 py-1 rounded-md bg-gray-200 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={saveDetails}
            className="px-3 py-1 rounded-md bg-blue-600 text-white text-sm"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </div>
)}

    </div>
  );
};
