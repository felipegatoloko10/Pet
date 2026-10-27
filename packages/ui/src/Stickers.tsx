/** Small, local vector stickers. Decorative marks never become focus targets. */
export function Sticker({
  shape = "star",
  className = "",
}: {
  shape?: "star" | "heart" | "bow" | "cloud";
  className?: string;
}) {
  return (
    <svg
      className={`sticker sticker-${shape} ${className}`}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <g
        stroke="#25232B"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {shape === "star" && (
          <path
            d="m32 5 8 18 20 2-15 14 4 20-17-10-17 10 4-20L4 25l20-2Z"
            fill="#FFF3A8"
          />
        )}
        {shape === "heart" && (
          <path
            d="M32 55S6 39 6 22C6 6 25 5 32 18 39 5 58 6 58 22c0 17-26 33-26 33Z"
            fill="#FFC8DD"
          />
        )}
        {shape === "bow" && (
          <>
            <path d="m25 34-6 24 12-7 5 6 4-25" fill="#B8E0FF" />
            <path
              d="M29 27C11 7 5 11 7 32s12 13 22 4m6-9C53 7 59 11 57 32S45 45 35 36"
              fill="#C9B6FF"
            />
            <ellipse cx="32" cy="32" rx="7" ry="9" fill="#FFC8DD" />
          </>
        )}
        {shape === "cloud" && (
          <>
            <path
              d="M16 46C0 46 0 26 14 25 12 7 37 4 42 22c18-5 25 24 7 24Z"
              fill="#B8E0FF"
            />
            <path d="M24 31v2m13-2v2m-10 5q4 4 7 0" />
            <path d="M12 50h35" stroke="#FFF" strokeWidth="4" />
          </>
        )}
      </g>
      {shape === "star" && (
        <path
          d="m27 20 4-8"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export function StickerCluster({ className = "" }: { className?: string }) {
  return (
    <div className={`sticker-cluster ${className}`} aria-hidden="true">
      <Sticker shape="cloud" />
      <Sticker shape="star" />
      <Sticker shape="heart" />
      <Sticker shape="bow" />
    </div>
  );
}
