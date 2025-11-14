"use client";
import { useEffect, useState } from "react";

export function GiftOpeningAnimation({ onComplete }: { onComplete: () => void }) {
  const [stage, setStage] = useState<"closed" | "opening" | "open">("closed");

  useEffect(() => {
    // Auto-start animation
    setTimeout(() => setStage("opening"), 100);
    setTimeout(() => setStage("open"), 1500);
    setTimeout(() => onComplete(), 2500);
  }, [onComplete]);

  return (
    <div className="flex items-center justify-center min-h-[200px]">
      {stage === "closed" && (
        <div className="text-6xl animate-bounce">🎁</div>
      )}
      {stage === "opening" && (
        <div className="text-6xl animate-pulse">✨</div>
      )}
      {stage === "open" && (
        <div className="text-6xl animate-bounce">🎉</div>
      )}
    </div>
  );
}

export function Confetti() {
  useEffect(() => {
    // Simple confetti effect using CSS
    const confetti = document.createElement("div");
    confetti.className = "fixed inset-0 pointer-events-none z-50";
    confetti.innerHTML = Array.from({ length: 50 }, () => {
      const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8"];
      const color = colors[Math.floor(Math.random() * colors.length)];
      const left = Math.random() * 100;
      const delay = Math.random() * 2;
      const duration = 2 + Math.random() * 2;
      return `
        <div style="
          position: absolute;
          left: ${left}%;
          top: -10px;
          width: 10px;
          height: 10px;
          background: ${color};
          border-radius: 50%;
          animation: confetti-fall ${duration}s ${delay}s linear forwards;
        "></div>
      `;
    }).join("");

    // Add animation keyframes if not already present
    if (!document.getElementById("confetti-styles")) {
      const style = document.createElement("style");
      style.id = "confetti-styles";
      style.textContent = `
        @keyframes confetti-fall {
          to {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(confetti);

    return () => {
      setTimeout(() => confetti.remove(), 5000);
    };
  }, []);

  return null;
}

