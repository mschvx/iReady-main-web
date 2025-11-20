import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useRoute } from "wouter";

interface Claim {
  barangayCode: string;
  username: string;
  claimedAt: number;
}

interface SupplyPrediction {
  adm4_pcode: string;
  [key: string]: any;
}

export const PublicAccount = (): JSX.Element => {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute<{ username: string }>("/u/:username");
  const username = params?.username || "User";

  const [claims, setClaims] = useState<Claim[]>([]);
  const [toReceive, setToReceive] = useState<SupplyPrediction[] | null>(null);
  const [focusBarangay, setFocusBarangay] = useState<SupplyPrediction | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [socialLinks, setSocialLinks] = useState<Array<{name: string, link: string}>>([]);

  useEffect(() => {
    // Fetch user profile
    (async () => {
      try {
        console.log(`Fetching profile for username: ${username}`);
        const resp = await fetch(`/api/profile/${encodeURIComponent(username)}`, { credentials: "include" });
        if (resp.ok) {
          const data = await resp.json();
          console.log('Profile data received:', data);
          setSummary(data.summary || "");
          setEmail(data.email || "");
          setPhone(data.phone || "");
          setSocialLinks(data.socialLinks || []);
        } else {
          console.error('Failed to fetch profile:', resp.status);
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        setSummary("");
        setEmail("");
        setPhone("");
        setSocialLinks([]);
      }
    })();

    // Fetch all claims and filter by username
    (async () => {
      try {
        const resp = await fetch("/api/barangay/claims", { credentials: "include" });
        if (resp.ok) {
          const data = await resp.json();
          const list: Claim[] = (data.claims || []).filter((c: any) => c.username === username);
          // sort newest first
          list.sort((a, b) => (b.claimedAt ?? 0) - (a.claimedAt ?? 0));
          setClaims(list);
        } else {
          setClaims([]);
        }
      } catch {
        setClaims([]);
      }
    })();

    // Load ToReceive once
    (async () => {
      try {
        let res = await fetch("/data/ToReceive.json");
        if (!res.ok) res = await fetch("/ToReceive.json");
        if (res.ok) {
          const data = await res.json();
          setToReceive(Array.isArray(data) ? data : []);
        } else {
          setToReceive([]);
        }
      } catch {
        setToReceive([]);
      }
    })();
  }, [username]);

  // Pick the most recent claimed barangay and enrich with prediction info
  useEffect(() => {
    if (!toReceive || claims.length === 0) {
      setFocusBarangay(null);
      return;
    }
    const mostRecent = claims[0]?.barangayCode;
    if (!mostRecent) {
      setFocusBarangay(null);
      return;
    }
    const pred = toReceive.find((p) => (p.adm4_pcode || "").toLowerCase() === mostRecent.toLowerCase()) || null;
    setFocusBarangay(pred);
  }, [toReceive, claims]);

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

  const goHome = () => setLocation("/home");
  const goAccount = () => setLocation("/account");

  return (
    <div className="bg-white w-full min-h-screen">
      {/* Header */}
      <header className="fixed top-0 left-0 w-full h-18 md:h-20 lg:h-24 z-[4000] bg-black shadow-none border-b-0 flex items-center">
        <div className="pl-4 md:pl-6 lg:pl-8">
          <img className="h-18 md:h-20 lg:h-22 w-auto block" alt="iReady Header" src="/figmaAssets/fixed.png" />
        </div>
      </header>

      {/* Top-right nav */}
      <nav className="fixed top-0 right-0 z-[4100] flex gap-3 md:gap-4 pr-4 md:pr-8 pt-3 md:pt-4 lg:pt-6">
        <Button onClick={goHome} className="h-10 md:h-12 px-4 md:px-6 bg-gray-700 rounded-full hover:bg-gray-600 text-sm md:text-base">Home</Button>
        <Button onClick={goAccount} className="h-10 md:h-12 px-4 md:px-6 bg-blue-700 rounded-full hover:bg-sky-300 text-sm md:text-base">Account</Button>
      </nav>

      <main className="pt-16 md:pt-20 lg:pt-24 px-6">
        <div className="max-w-6xl mx-auto">
          {/* Profile header */}
          <section className="flex flex-col md:flex-row gap-6 items-start md:items-center bg-white rounded-2xl p-6">
            <img
              src={avatarDataUrl}
              alt={username}
              className="w-40 h-40 rounded-full shadow-lg object-cover"
            />
            <div className="flex-1 space-y-4">
              <div className="text-3xl md:text-4xl font-extrabold text-black">{username}</div>
              
              <div>
                <div className="text-lg md:text-xl font-semibold text-gray-900 mb-2">Organization Details</div>
                <div className="text-sm md:text-base text-gray-700 bg-gray-50 p-3 rounded-lg">
                  {summary || "None Specified"}
                </div>
              </div>
              
              <div>
                <div className="text-lg md:text-xl font-semibold text-gray-900 mb-2">Contact Details</div>
                <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                  {/* Social Media Links */}
                  {socialLinks.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-gray-600 uppercase mb-1">Social Media</div>
                      <div className="space-y-1">
                        {socialLinks.map((social, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-700">{social.name}:</span>
                            <a 
                              href={social.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline break-all"
                            >
                              {social.link}
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Email */}
                  {email && (
                    <div>
                      <div className="text-xs font-semibold text-gray-600 uppercase mb-1">Email</div>
                      <a 
                        href={`mailto:${email}`}
                        className="text-sm md:text-base text-blue-600 hover:underline"
                      >
                        {email}
                      </a>
                    </div>
                  )}
                  
                  {/* Phone */}
                  {phone && (
                    <div>
                      <div className="text-xs font-semibold text-gray-600 uppercase mb-1">Phone</div>
                      <a 
                        href={`tel:${phone}`}
                        className="text-sm md:text-base text-blue-600 hover:underline"
                      >
                        {phone}
                      </a>
                    </div>
                  )}
                  
                  {/* No contact info */}
                  {!email && !phone && socialLinks.length === 0 && (
                    <div className="text-sm md:text-base text-gray-500 italic">
                      No contact information provided
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Current Barangay Focus */}
          <section className="mt-6 bg-gray-200 rounded-[32px] p-6">
            <h2 className="text-3xl md:text-4xl font-extrabold mb-4 text-black text-center">Current Barangay Focus</h2>
            {claims.length === 0 ? (
              <div className="text-base md:text-lg text-gray-600 text-center">No barangays claimed by this user yet.</div>
            ) : (
              <div className="text-center">
                <div className="mb-3">
                  <button
                    onClick={() => setLocation(`/home?barangay=${encodeURIComponent(claims[0].barangayCode)}`)}
                    className="text-blue-600 inline-flex items-center text-2xl md:text-3xl font-extrabold underline hover:text-blue-800"
                  >
                    ↗&nbsp; {claims[0].barangayCode}
                  </button>
                </div>
                <div className="text-gray-800 text-lg md:text-xl font-semibold mb-2">Location Information</div>
                <div className="text-gray-900 text-xl md:text-2xl font-bold">
                  Population: {focusBarangay?.pop_30min ?? "N/A"}
                </div>
              </div>
            )}
          </section>

          {/* bottom action (align to the right) */}
          <div className="flex justify-end mt-4">
            <button
              onClick={() => setLocation('/home')}
              className="bg-blue-700 hover:bg-sky-300 text-white font-bold px-6 py-2 rounded-full shadow-sm hover:opacity-95 text-sm md:text-base"
            >
              Go Back
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PublicAccount;
