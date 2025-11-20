import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";

export const SignUpOverlay = ({
  onClose,
  onOpenLogin,
}: {
  onClose?: () => void;
  onOpenLogin?: () => void;
}): JSX.Element => {
  const [, setLocation] = useLocation();
  const close = () => {
    if (onClose) onClose();
    else setLocation("/");
  };

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username || !password || !confirmPassword) {
      setError("All fields are required");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Signup failed");
      }

      // persist the username so Account page can use it as the display name
      try {
        localStorage.setItem("username", username);
      } catch (e) {
        /* ignore localStorage errors */
      }

      setLocation("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
    >
      {/* simple translucent backdrop (no backdrop-blur) */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={close}
      />

      {/* centered white panel */}
      <div
        className="relative w-full max-w-md bg-white border border-black/5 rounded-2xl p-6 mx-auto shadow-2xl ring-1 ring-black/5 transform-gpu transition-transform duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <form
          onSubmit={handleSubmit}
          className="flex flex-col items-center justify-center gap-3 w-full max-w-[420px] mx-auto text-center"
        >
          <h1 className="text-2xl md:text-4xl lg:text-5xl font-extrabold leading-tight mb-4 text-black">
            SIGN UP
          </h1>

          {error && (
            <div className="w-full bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3 w-full">
            <Input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full h-[52px] bg-[#f3f4f6] rounded-[40px] border-0 px-4 text-sm text-center"
              disabled={isLoading}
            />

            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-[52px] bg-[#f3f4f6] rounded-[40px] border-0 px-4 text-sm text-center"
              disabled={isLoading}
            />

            <Input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full h-[52px] bg-[#f3f4f6] rounded-[40px] border-0 px-4 text-sm text-center"
              disabled={isLoading}
            />
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-[200px] bg-[#d9d9d9]/95 rounded-[40px] py-3 hover:bg-[#c9c9c9]/95 shadow-lg mt-2"
          >
            <span className="[font-family:'Akira_Expanded-SuperBold',Helvetica] font-bold text-black text-[18px] tracking-tight">
              {isLoading ? "CREATING..." : "SUBMIT"}
            </span>
          </Button>

          <div className="flex flex-col items-center gap-1 mt-2 w-full">
            <button
              type="button"
              onClick={() => {
                if (onOpenLogin) {
                  onOpenLogin();
                } else {
                  setLocation("/login");
                }
              }}
              className="[font-family:'Akira_Expanded-SuperBold',Helvetica] font-bold text-black font-style: italic text-[15px] bg-transparent border-0 cursor-pointer hover:underline hover:text-sky-600"
            >
              Have an account? Log In Instead
            </button>

            <button
              type="button"
              onClick={close}
              className="[font-family:'Akira_Expanded-SuperBold',Helvetica] font-extrabold text-black text-[15px] bg-transparent border-0 cursor-pointer hover:underline hover:text-sky-600"
            >
              BACK
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
