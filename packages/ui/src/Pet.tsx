"use client";
import { useEffect, useState, useRef, type CSSProperties } from "react";
import {
  petState,
  petSleeping,
  advancePetCare,
  type PetCare,
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
  speak,
  care,
}: {
  preferences: Preferences;
  message?: string;
  focus?: boolean;
  interactive?: boolean;
  onClick?: () => void;
  activity?: PetState;
  soundEnabled?: boolean;
  speak?: (text: string) => () => void;
  care?: PetCare;
}) {
  const [naturalState, setState] = useState<PetState>("idle");
  const [petted, setPetted] = useState(false);
  const state = petted ? "affection" : naturalState;
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const scene = useRef<HTMLDivElement>(null);
  const affectionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(affectionTimer.current), []);
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
    if (speak) return speak(message);
    if (!("speechSynthesis" in window)) return;
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
    speak,
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
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    if (!visible) return;
    let wakeTimer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const now = new Date();
      const currentCare = care ? advancePetCare(care, p, now) : undefined;
      const next = care
        ? petSleeping(care, p, now)
          ? "sleep"
          : focus
            ? "focus"
            : "idle"
        : petState(now, p, focus);
      if (activity && activity !== "idle") setState(activity);
      else if (previous.current === "sleep" && next !== "sleep") {
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
          "stretch",
          "groom",
          "curious",
          "peek",
          "sit",
          "wave",
        ];
        setState(
          message
            ? "speak"
            : currentCare && currentCare.energy < 25
              ? "yawn"
              : currentCare && currentCare.mood < 25
                ? "sit"
                : choices[Math.floor(Math.random() * choices.length)],
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
  }, [p, focus, visible, message, activity, care]);
  function affection() {
    setPetted(true);
    clearTimeout(affectionTimer.current);
    affectionTimer.current = setTimeout(() => setPetted(false), 2200);
    onClick?.();
  }
  return (
    <div
      ref={scene}
      className={`pet-scene ${reduced ? "reduced" : ""} ${!visible ? "paused" : ""}`}
      style={
        { "--pet-color": p.color, "--pet-accent": p.accent } as CSSProperties
      }
      onPointerMove={(event) => {
        if (reduced || !scene.current) return;
        const rect = scene.current.getBoundingClientRect();
        scene.current.style.setProperty(
          "--gaze-x",
          `${Math.max(-3, Math.min(3, (event.clientX - rect.left - rect.width / 2) / 35))}px`,
        );
        scene.current.style.setProperty(
          "--gaze-y",
          `${Math.max(-2, Math.min(2, (event.clientY - rect.top - rect.height / 2) / 35))}px`,
        );
      }}
      onPointerLeave={() => {
        scene.current?.style.setProperty("--gaze-x", "0px");
        scene.current?.style.setProperty("--gaze-y", "0px");
      }}
    >
      {message && (
        <div className="pet-balloon" role="status">
          {message}
        </div>
      )}
      <button
        className={`pet pet-${state}`}
        data-pet-interactive
        aria-label={`${p.name}: ${state === "sleep" ? "dormindo" : "clique para dar carinho"}`}
        onClick={interactive ? affection : undefined}
        tabIndex={interactive ? 0 : -1}
      >
        <svg viewBox="0 0 220 210" aria-hidden="true">
          <ellipse
            className="pet-ground-shadow"
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
              <g className="pet-ear-left">
                <path
                  d="M51 84 Q31 17 53 29 L86 51 Z"
                  fill="var(--pet-color)"
                />
                <path d="M53 65 L50 39 L74 53 Z" fill="var(--pet-accent)" />
              </g>
              <g className="pet-ear-right">
                <path
                  d="M134 51 L167 29 Q189 17 169 84 Z"
                  fill="var(--pet-color)"
                />
                <path d="M146 53 L170 39 L167 65 Z" fill="var(--pet-accent)" />
              </g>
              <path
                d="M49 78 Q47 42 110 42 Q173 42 171 78 Q182 137 111 142 Q38 137 49 78"
                fill="var(--pet-color)"
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
              {["sleep", "yawn", "affection", "groom", "dance"].includes(
                state,
              ) ? (
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
                <g className="pet-gaze">
                  <g className="eyes" fill="#264e40">
                    <ellipse cx="84" cy="89" rx="5" ry="7" />
                    <ellipse cx="137" cy="89" rx="5" ry="7" />
                    <circle cx="86" cy="87" r="1.5" fill="white" />
                    <circle cx="139" cy="87" r="1.5" fill="white" />
                  </g>
                </g>
              )}
              <path
                d="M106 102 Q110 107 114 102 Q110 99 106 102"
                fill="#264e40"
              />
              {state === "speak" ||
              state === "yawn" ||
              state === "surprised" ? (
                <ellipse
                  className="pet-mouth"
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
              {state === "groom" && (
                <path
                  className="pet-tongue"
                  d="M109 115 Q110 130 118 118"
                  fill="var(--pet-accent)"
                />
              )}
              {state === "focus" && (
                <g fill="none" stroke="#365d4d" strokeWidth="2">
                  <circle cx="84" cy="89" r="14" />
                  <circle cx="137" cy="89" r="14" />
                  <path d="M98 88 Q110 82 123 88" />
                </g>
              )}
            </g>
            <g className="pet-arm-left">
              <path
                d="M64 143 Q43 162 66 172"
                fill="none"
                stroke="var(--pet-color)"
                strokeWidth="17"
                strokeLinecap="round"
              />
              <circle
                className="pet-paw-pad"
                cx="66"
                cy="172"
                r="4.5"
                fill="var(--pet-accent)"
                opacity=".75"
              />
            </g>
            <g className="pet-arm-right">
              <path
                d="M156 143 Q178 162 154 172"
                fill="none"
                stroke="var(--pet-color)"
                strokeWidth="17"
                strokeLinecap="round"
              />
              <circle
                className="pet-paw-pad"
                cx="154"
                cy="172"
                r="4.5"
                fill="var(--pet-accent)"
                opacity=".75"
              />
            </g>
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
            <text
              className="pet-thought"
              x="172"
              y="50"
              fontSize="25"
              fill="#527e68"
            >
              …
            </text>
          )}
          {state === "celebrate" && (
            <g className="pet-confetti">
              {[
                "#e1b84c",
                "#df99b5",
                "#73b8a2",
                "#ad94d0",
                "#e1b84c",
                "#df99b5",
              ].map((color, i) => (
                <circle
                  key={i}
                  cx={25 + i * 34}
                  cy={25 + (i % 2) * 20}
                  r="3"
                  fill={color}
                  style={{ animationDelay: `${i * -0.16}s` }}
                />
              ))}
            </g>
          )}
          {state === "surprised" && (
            <text
              className="pet-thought"
              x="172"
              y="45"
              fontSize="23"
              fill="#bf9a47"
            >
              !
            </text>
          )}
          {state === "listen" && (
            <g
              className="pet-listening"
              fill="none"
              stroke="#79ab96"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M185 63 Q198 75 185 88" />
              <path d="M194 56 Q214 75 194 95" />
            </g>
          )}
        </svg>
      </button>
    </div>
  );
}
