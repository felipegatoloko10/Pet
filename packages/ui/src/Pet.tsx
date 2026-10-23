"use client";
import { useEffect, useState, useRef, type CSSProperties } from "react";
import {
  petState,
  isQuiet,
  type PetState,
  type Preferences,
} from "@pingo/core";
export function Pet({
  preferences: p,
  message,
  focus = false,
  interactive = true,
  onClick,
  activity,
  soundEnabled = false,
}: {
  preferences: Preferences;
  message?: string;
  focus?: boolean;
  interactive?: boolean;
  onClick?: () => void;
  activity?: PetState;
  soundEnabled?: boolean;
}) {
  const [state, setState] = useState<PetState>("idle");
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (
      !soundEnabled ||
      !visible ||
      !p.voice ||
      !message ||
      isQuiet(new Date(), p)
    )
      return;
    const text = new SpeechSynthesisUtterance(message);
    text.lang = "pt-BR";
    speechSynthesis.speak(text);
    return () => speechSynthesis.cancel();
  }, [
    soundEnabled,
    visible,
    p.voice,
    message,
    p.quietStart,
    p.quietEnd,
    p.timezone,
  ]);
  useEffect(() => {
    if (
      !soundEnabled ||
      !visible ||
      !p.snore ||
      state !== "sleep" ||
      isQuiet(new Date(), p)
    )
      return;
    let context: AudioContext | undefined;
    const timer = setInterval(() => {
      try {
        context ??= new AudioContext();
        if (context.state !== "running") return;
        const oscillator = context.createOscillator(),
          gain = context.createGain();
        oscillator.frequency.value = 85;
        gain.gain.setValueAtTime(0.012, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          context.currentTime + 0.65,
        );
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.7);
      } catch {
        /* Audio may require a local browser interaction. */
      }
    }, 6000);
    const resume = () => {
      context ??= new AudioContext();
      void context.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", resume, { once: true });
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointerdown", resume);
      void context?.close();
    };
  }, [
    soundEnabled,
    visible,
    p.snore,
    state,
    p.quietStart,
    p.quietEnd,
    p.timezone,
  ]);
  const previous = useRef<PetState>("idle");
  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    if (!visible) return;
    let wakeTimer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const next = petState(new Date(), p, focus);
      if (previous.current === "sleep" && next !== "sleep") {
        setState("wake");
        wakeTimer = setTimeout(() => setState(next), 1800);
      } else if (next === "sleep" || next === "focus") setState(next);
      else {
        const choices: PetState[] = [
          "idle",
          "idle",
          "blink",
          "look",
          "walk",
          "yawn",
        ];
        setState(
          activity ??
            (message
              ? "speak"
              : choices[Math.floor(Math.random() * choices.length)]),
        );
      }
      previous.current = next;
    };
    tick();
    const timer = setInterval(tick, 6000);
    return () => {
      clearInterval(timer);
      if (wakeTimer) clearTimeout(wakeTimer);
    };
  }, [p, focus, visible, message, activity]);
  function affection() {
    setState("affection");
    setTimeout(() => setState("idle"), 2200);
    onClick?.();
  }
  return (
    <div
      className={`pet-scene ${reduced ? "reduced" : ""} ${!visible ? "paused" : ""}`}
      style={
        { "--pet-color": p.color, "--pet-accent": p.accent } as CSSProperties
      }
    >
      {message && (
        <div className="pet-balloon" role="status">
          {message}
        </div>
      )}
      <button
        className={`pet pet-${state}`}
        aria-label={`${p.name}: ${state === "sleep" ? "dormindo" : "clique para dar carinho"}`}
        onClick={interactive ? affection : undefined}
        tabIndex={interactive ? 0 : -1}
      >
        <svg viewBox="0 0 220 210" aria-hidden="true">
          <ellipse
            cx="110"
            cy="191"
            rx="68"
            ry="10"
            fill="#153c2a"
            opacity=".08"
          />
          <g className="pet-body">
            <path
              className="tail"
              d="M163 153 Q212 147 187 111"
              fill="none"
              stroke="var(--pet-color)"
              strokeWidth="22"
              strokeLinecap="round"
            />
            <ellipse
              cx="110"
              cy="147"
              rx="56"
              ry="42"
              fill="var(--pet-color)"
            />
            <ellipse
              cx="110"
              cy="151"
              rx="30"
              ry="29"
              fill="#fff"
              opacity=".5"
            />
            <ellipse
              className="foot foot-left"
              cx="76"
              cy="179"
              rx="20"
              ry="10"
              fill="var(--pet-color)"
            />
            <ellipse
              className="foot foot-right"
              cx="146"
              cy="179"
              rx="20"
              ry="10"
              fill="var(--pet-color)"
            />
            <g className="pet-head">
              <path
                d="M51 85 Q35 12 74 40 Q110 27 146 40 Q185 12 169 85 Q181 137 111 142 Q38 137 51 85"
                fill="var(--pet-color)"
              />
              <path
                d="M53 62 L53 39 L73 51 M147 51 L168 39 L167 63"
                fill="var(--pet-accent)"
                opacity=".9"
              />
              <ellipse
                cx="69"
                cy="104"
                rx="12"
                ry="7"
                fill="var(--pet-accent)"
              />
              <ellipse
                cx="151"
                cy="104"
                rx="12"
                ry="7"
                fill="var(--pet-accent)"
              />
              {state === "sleep" || state === "yawn" ? (
                <g
                  fill="none"
                  stroke="#264e40"
                  strokeWidth="4"
                  strokeLinecap="round"
                >
                  <path d="M75 88 Q83 96 91 88" />
                  <path d="M130 88 Q138 96 146 88" />
                </g>
              ) : (
                <g className="eyes" fill="#264e40">
                  <ellipse cx="84" cy="89" rx="5" ry="7" />
                  <ellipse cx="137" cy="89" rx="5" ry="7" />
                  <circle cx="86" cy="87" r="1.5" fill="white" />
                  <circle cx="139" cy="87" r="1.5" fill="white" />
                </g>
              )}
              <path
                d="M106 102 Q110 107 114 102 Q110 99 106 102"
                fill="#264e40"
              />
              {state === "speak" || state === "yawn" ? (
                <ellipse
                  cx="110"
                  cy="115"
                  rx="5"
                  ry={state === "yawn" ? 9 : 5}
                  fill="#264e40"
                />
              ) : (
                <path
                  d="M99 112 Q105 118 110 112 Q115 118 121 112"
                  fill="none"
                  stroke="#264e40"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              )}
            </g>
            <path
              d="M64 143 Q47 164 66 163 M156 143 Q173 164 154 163"
              fill="none"
              stroke="var(--pet-color)"
              strokeWidth="17"
              strokeLinecap="round"
            />
          </g>
          {state === "sleep" && (
            <text className="zzz" x="169" y="39" fill="#597866" fontSize="24">
              z Z
            </text>
          )}
          {state === "affection" && (
            <g className="hearts" fill="var(--pet-accent)">
              <path d="M30 49 C15 33 6 53 30 67 C54 53 45 33 30 49" />
              <path d="M188 69 C177 57 169 73 188 84 C207 73 199 57 188 69" />
            </g>
          )}
          {state === "think" && (
            <text x="172" y="50" fontSize="25">
              …
            </text>
          )}
          {state === "celebrate" && (
            <text x="15" y="50" fontSize="26">
              ✦
            </text>
          )}
        </svg>
      </button>
    </div>
  );
}
